// background.js — MV3 service worker hosting the tree-sitter WASM parsers.
//
// WHY A SERVICE WORKER: content scripts cannot reliably compile WebAssembly —
// they are subject to the host page's CSP (gemini.google.com blocks
// wasm-unsafe-eval). The extension's own CSP (manifest.json
// content_security_policy.extension_pages, with 'wasm-unsafe-eval') governs
// this worker, so WASM compiles here. Bonus: parsing runs entirely off the
// tab's main thread.
//
// PROTOCOL (from dep-graph.js via chrome.runtime.sendMessage):
//   { type: "ccbTsParse", lang: "cs"|"js", files: [{ path, content }] }
//   → { ok: true, results: [factsPerFile] }
//   → { ok: false, error: string }   (batch-level failure, e.g. WASM init)
//
// Facts per file — always { path, ok }, plus on ok:
//   cs: { namespace, usings: string[], definitions: string[], identifiers: string[] }
//   js: { imports: string[] }
// Per-file parse failures return { path, ok: false } so dep-graph.js can fall
// back to its regex path for just that file.
//
// EXTRACTION IS A MANUAL TREE WALK, NOT A QUERY: tree-sitter queries throw at
// compile time if a pattern names a node type the shipped grammar doesn't
// have (grammar versions drift). A cursor walk that switches on node.type
// simply doesn't match unknown types — robust across grammar upgrades.
//
// The worker may be killed by Chrome at any idle moment; every message
// re-awakens it and re-runs init (cached in-flight via _initPromise, but a
// fresh worker instance starts from null). Init is ~100-300ms; parsing a
// batch dwarfs that.

import { Parser, Language } from "./wasm/tree-sitter.js";

const LANGUAGE_WASM = {
  cs: "wasm/tree-sitter-c-sharp.wasm",
  js: "wasm/tree-sitter-javascript.wasm",
};

let _initPromise = null; // Parser.init() — once per worker lifetime
const _langPromises = {}; // lang -> Promise<Language>, loaded lazily per lang
let _parser = null;

function ensureRuntime() {
  if (!_initPromise) {
    _initPromise = Parser.init({
      locateFile: () => chrome.runtime.getURL("wasm/tree-sitter.wasm"),
    }).then(() => {
      _parser = new Parser();
    });
  }
  return _initPromise;
}

function ensureLanguage(lang) {
  if (!_langPromises[lang]) {
    _langPromises[lang] = ensureRuntime().then(() =>
      Language.load(chrome.runtime.getURL(LANGUAGE_WASM[lang])),
    );
  }
  return _langPromises[lang];
}

// ============================================================
// C# fact extraction
// ============================================================

// Type-declaring node types whose "name" field registers in the symbol
// table. record_struct_declaration exists in some grammar versions ("record
// struct X"); in others it parses as record_declaration — listing both is
// harmless (a walk, not a query).
const CS_TYPE_DECLARATIONS = new Set([
  "class_declaration",
  "interface_declaration",
  "struct_declaration",
  "enum_declaration",
  "record_declaration",
  "record_struct_declaration",
  "delegate_declaration",
]);

const CS_NAMESPACE_DECLARATIONS = new Set([
  "namespace_declaration",
  "file_scoped_namespace_declaration",
]);

// The name payload of a using_directive / namespace_declaration: the last
// child that is a plain or qualified name. Handles `using A.B;`,
// `using static A.B;` and `using X = A.B;` (the qualified_name after `=`
// is last, which is the target we want).
function lastNameChild(node) {
  for (let i = node.namedChildCount - 1; i >= 0; i--) {
    const child = node.namedChild(i);
    if (child && (child.type === "identifier" || child.type === "qualified_name")) {
      return child.text;
    }
  }
  return null;
}

function extractCsFacts(tree) {
  const definitions = new Set();
  const identifiers = new Set();
  const usings = [];
  let namespace = "";

  const cursor = tree.walk();
  let reachedRoot = false;
  while (!reachedRoot) {
    const node = cursor.currentNode;
    const type = node.type;

    if (type === "identifier") {
      identifiers.add(node.text);
    } else if (CS_TYPE_DECLARATIONS.has(type)) {
      const name = node.childForFieldName("name");
      if (name) definitions.add(name.text);
    } else if (CS_NAMESPACE_DECLARATIONS.has(type)) {
      if (!namespace) {
        const name = node.childForFieldName("name");
        if (name) namespace = name.text;
      }
    } else if (type === "using_directive") {
      const name = lastNameChild(node);
      if (name) usings.push(name);
    }

    // Depth-first traversal via cursor (no recursion — C# files nest deep).
    if (cursor.gotoFirstChild()) continue;
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) {
        reachedRoot = true;
        break;
      }
    }
  }
  cursor.delete();

  return {
    namespace,
    usings,
    definitions: Array.from(definitions),
    identifiers: Array.from(identifiers),
  };
}

// ============================================================
// JS/JSX fact extraction — import/require/dynamic-import specifiers
// ============================================================

function stringLiteralValue(node) {
  // (string) wraps (string_fragment); template_string only counts when it
  // has no substitutions (a plain `./x` template used in import()).
  if (!node) return null;
  if (node.type === "string") {
    const frag = node.namedChildCount === 1 ? node.namedChild(0) : null;
    if (frag && frag.type === "string_fragment") return frag.text;
    if (node.namedChildCount === 0) return ""; // empty string
    return null; // has interpolation/escapes spread across children — skip
  }
  return null;
}

function extractJsFacts(tree) {
  const imports = new Set();

  const cursor = tree.walk();
  let reachedRoot = false;
  while (!reachedRoot) {
    const node = cursor.currentNode;
    const type = node.type;

    if (type === "import_statement" || type === "export_statement") {
      const source = node.childForFieldName("source");
      const value = stringLiteralValue(source);
      if (value) imports.add(value);
    } else if (type === "call_expression") {
      const fn = node.childForFieldName("function");
      // require("x") and import("x"). The grammar parses dynamic import as a
      // call_expression whose function child is an `import` node.
      if (fn && (fn.type === "import" || (fn.type === "identifier" && fn.text === "require"))) {
        const args = node.childForFieldName("arguments");
        const first = args && args.namedChildCount > 0 ? args.namedChild(0) : null;
        const value = stringLiteralValue(first);
        if (value) imports.add(value);
      }
    }

    if (cursor.gotoFirstChild()) continue;
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) {
        reachedRoot = true;
        break;
      }
    }
  }
  cursor.delete();

  return { imports: Array.from(imports) };
}

// ============================================================
// Message handler
// ============================================================

async function handleParseBatch(lang, files) {
  const language = await ensureLanguage(lang);
  _parser.setLanguage(language);

  const results = [];
  for (const file of files) {
    let tree = null;
    try {
      tree = _parser.parse(file.content);
      if (!tree) {
        results.push({ path: file.path, ok: false });
        continue;
      }
      const facts = lang === "cs" ? extractCsFacts(tree) : extractJsFacts(tree);
      results.push({ path: file.path, ok: true, ...facts });
    } catch (_e) {
      // A single pathological file must not fail the batch — dep-graph.js
      // regex-falls-back for this file alone.
      results.push({ path: file.path, ok: false });
    } finally {
      if (tree) tree.delete();
    }
  }
  return results;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "ccbTsParse") return false;
  if (!LANGUAGE_WASM[msg.lang] || !Array.isArray(msg.files)) {
    sendResponse({ ok: false, error: "bad request" });
    return false;
  }
  handleParseBatch(msg.lang, msg.files)
    .then((results) => sendResponse({ ok: true, results }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
  return true; // async sendResponse
});
