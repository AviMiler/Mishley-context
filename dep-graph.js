// dep-graph.js — static, no-AI dependency graph for scanned code projects.
// Resolves JS/TS/JSX import & require statements to files (deterministic,
// high-confidence), and C# class/namespace references via a symbol table
// (heuristic, best-effort — favors including too much over missing a file).
// Neither is 100% — dynamic dispatch (computed member access, reflection,
// eval, virtual/interface calls) can't be resolved statically. See CLAUDE.md.
//
// SYMBOL EXTRACTION IS AST-FIRST (2026-07-23): .cs and .js/.jsx/.mjs/.cjs
// files are parsed by tree-sitter (real grammar-level AST) in the background
// service worker (background.js hosts the WASM — content scripts can't
// compile WASM under the host page's CSP). This kills the whole class of
// regex bugs the project kept hitting (phantom "struct" symbol from `record
// struct`, phantom // comment from a URL in Razor markup). The regex layer
// below is RETAINED IN FULL as the fallback — per file (a single file
// tree-sitter can't parse) and per language (worker dead, WASM load failed)
// — so a scan never breaks because of the parser. .ts/.tsx stay on the regex
// import scan by scope decision (imports are simple syntax; regex is
// high-confidence there). Razor has no tree-sitter grammar — its markup scan
// stays regex, but it consumes the (now AST-accurate) C# symbol table.
// JS resolution also handles `@/`/`~/` alias imports (tried against `src/`
// first, then project root) and is case-insensitive as a fallback, since
// real filesystems the extension runs on (Windows/macOS) are.
// Razor (.cshtml/.razor) reuses the C# symbol table: any known class/
// interface/etc. name referenced in the markup (@model, @inject, tag
// helpers, code blocks — anything, since Razor mixes C# into HTML) becomes
// an edge to that type's file, filtered by @using directives the same way
// C# `using`s filter candidates. Razor Pages/Components code-behind pairs
// (`Foo.cshtml`<->`Foo.cshtml.cs`, `Foo.razor`<->`Foo.razor.cs`) get a
// guaranteed bidirectional edge on top of that, since they're really one
// unit split across two files and neither necessarily name-references the
// other's types.
// Exposes: window.__ccbDepGraph
//
// Public API:
//   buildGraph(included) — ASYNC. included: [{relativePath, content, ...}]
//     from scanCodeProject (called while file content is still in memory).
//     Resolves to { [relativePath]: string[] } — file -> files it depends on.
//     Async only so it can yield to the event loop periodically; on a large
//     C#/Razor project the analysis is heavy enough to freeze the tab if run
//     in one uninterrupted synchronous pass.
//   getTransitiveClosure(graph, startPath) — BFS with cycle guard.
//     Returns Set<string> including startPath itself.
//   getDirectDependents(graph, startPath) — files that directly import/
//     reference startPath (one hop, not transitive). Returns Set<string>,
//     NOT including startPath itself.
//   getFullContext(graph, startPath) — getTransitiveClosure(startPath) plus
//     getDirectDependents(startPath): everything the file needs, plus who
//     uses it. Returns Set<string> including startPath itself.

(() => {
  if (window.__ccbDepGraphInstalled) return;
  window.__ccbDepGraphInstalled = true;

  const JS_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx"]);

  function ext(path) {
    const dot = path.lastIndexOf(".");
    return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ============================================================
  // Shared comment/string scanner (single pass, mode-stack based).
  // Not a full grammar parser — just enough to tell "comment" / "string-like
  // literal" / "real code" apart so regex passes downstream don't get
  // confused by text that only *looks* like code inside a string or comment.
  // ============================================================
  function scanRegions(text, lang) {
    const comments = [];
    const strings = [];
    const n = text.length;
    let i = 0;
    const stack = ["code"];
    let prevSignificant = "";

    const isRegexContext = () =>
      !prevSignificant || /[([{,;:=!&|?+\-*%^~<>]/.test(prevSignificant);

    while (i < n) {
      const mode = stack[stack.length - 1];
      const c = text[i];
      const c2 = text[i + 1];

      // C#-style comments are NOT scanned in Razor: the razor "code" mode is
      // mostly HTML markup with no string detection, so a URL in an attribute
      // ("https://...", src="//cdn...") would start a phantom // comment and
      // blank every type reference on the rest of that line. Razor keeps only
      // @* *@ and <!-- --> (below); a commented-out type name inside an @{ }
      // block may over-include, which is the documented bias direction.
      if (lang !== "razor" && (mode === "code" || mode === "templateExpr" || mode === "interpExpr") && c === "/" && c2 === "/") {
        const s = i; i += 2;
        while (i < n && text[i] !== "\n") i++;
        comments.push([s, i]);
        continue;
      }
      if (lang !== "razor" && (mode === "code" || mode === "templateExpr" || mode === "interpExpr") && c === "/" && c2 === "*") {
        const s = i; i += 2;
        while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i = Math.min(i + 2, n);
        comments.push([s, i]);
        continue;
      }

      if (lang === "razor" && mode === "code") {
        if (c === "@" && c2 === "*") {
          const s = i; i += 2;
          while (i < n && !(text[i] === "*" && text[i + 1] === "@")) i++;
          i = Math.min(i + 2, n);
          comments.push([s, i]);
          continue;
        }
        if (c === "<" && text.slice(i, i + 4) === "<!--") {
          const s = i;
          const end = text.indexOf("-->", i + 4);
          i = end === -1 ? n : end + 3;
          comments.push([s, i]);
          continue;
        }
      }

      if (lang === "js") {
        if (mode === "code" || mode === "templateExpr") {
          if (c === "'" || c === '"') {
            const q = c, s = i; i++;
            while (i < n && text[i] !== q) { if (text[i] === "\\") i++; i++; }
            i = Math.min(i + 1, n);
            strings.push([s, i]);
            prevSignificant = q;
            continue;
          }
          if (c === "`") {
            strings.push([i, i + 1]);
            i++;
            stack.push("template");
            continue;
          }
          if (c === "/" && isRegexContext()) {
            const s = i; let j = i + 1, inClass = false, ok = false;
            while (j < n) {
              if (text[j] === "\\") { j += 2; continue; }
              if (text[j] === "\n") break;
              if (text[j] === "[") inClass = true;
              else if (text[j] === "]") inClass = false;
              else if (text[j] === "/" && !inClass) { ok = true; j++; break; }
              j++;
            }
            if (ok) {
              while (j < n && /[a-z]/i.test(text[j])) j++;
              strings.push([s, j]);
              i = j;
              prevSignificant = "/";
              continue;
            }
          }
        } else if (mode === "template") {
          if (c === "\\") { strings.push([i, i + 2]); i += 2; continue; }
          if (c === "`") { i++; stack.pop(); continue; }
          if (c === "$" && c2 === "{") { i += 2; stack.push("templateExpr"); continue; }
          strings.push([i, i + 1]);
          i++;
          continue;
        }
        if (mode === "templateExpr") {
          if (c === "{") { stack.push("templateExpr"); i++; continue; }
          if (c === "}") { stack.pop(); i++; continue; }
        }
      } else if (lang === "cs") {
        if (mode === "code" || mode === "interpExpr") {
          if (c === "@" && c2 === '"') { i += 2; stack.push("verbatim"); continue; }
          if (c === "$" && c2 === '"') { i += 2; stack.push("interp"); continue; }
          if ((c === "$" && c2 === "@" && text[i + 2] === '"') || (c === "@" && c2 === "$" && text[i + 2] === '"')) {
            i += 3; stack.push("interpVerbatim"); continue;
          }
          if (c === '"') {
            const s = i; i++;
            while (i < n && text[i] !== '"') { if (text[i] === "\\") i++; i++; }
            i = Math.min(i + 1, n);
            strings.push([s, i]);
            continue;
          }
          if (c === "'") {
            const s = i; i++;
            while (i < n && text[i] !== "'") { if (text[i] === "\\") i++; i++; }
            i = Math.min(i + 1, n);
            strings.push([s, i]);
            continue;
          }
        }
        if (mode === "verbatim" || mode === "interpVerbatim") {
          if (c === '"' && c2 === '"') { strings.push([i, i + 2]); i += 2; continue; }
          if (mode === "interpVerbatim" && c === "{" && c2 === "{") { strings.push([i, i + 2]); i += 2; continue; }
          if (mode === "interpVerbatim" && c === "}" && c2 === "}") { strings.push([i, i + 2]); i += 2; continue; }
          if (mode === "interpVerbatim" && c === "{") { i++; stack.push("interpExpr"); continue; }
          if (c === '"') { i++; stack.pop(); continue; }
          strings.push([i, i + 1]);
          i++;
          continue;
        }
        if (mode === "interp") {
          if (c === "\\") { strings.push([i, i + 2]); i += 2; continue; }
          if (c === "{" && c2 === "{") { strings.push([i, i + 2]); i += 2; continue; }
          if (c === "}" && c2 === "}") { strings.push([i, i + 2]); i += 2; continue; }
          if (c === "{") { i++; stack.push("interpExpr"); continue; }
          if (c === '"') { i++; stack.pop(); continue; }
          strings.push([i, i + 1]);
          i++;
          continue;
        }
        if (mode === "interpExpr") {
          if (c === "{") { stack.push("interpExpr"); i++; continue; }
          if (c === "}") { stack.pop(); i++; continue; }
        }
      }

      prevSignificant = /\s/.test(c) ? prevSignificant : c;
      i++;
    }

    return { comments, strings };
  }

  function blank(text, ranges) {
    if (!ranges.length) return text;
    const chars = text.split("");
    for (const [start, end] of ranges) {
      for (let i = start; i < end && i < chars.length; i++) {
        if (chars[i] !== "\n") chars[i] = " ";
      }
    }
    return chars.join("");
  }

  // scanRegions is the single most expensive step per file (a char-by-char
  // pass), and the same file used to be scanned up to three times: once to
  // build the C# symbol table, then twice more when analyzing it. This caches
  // one scan per file for the lifetime of a buildGraph() call and derives both
  // stripped variants from it lazily.
  function createRegionCache() {
    const cache = new Map();
    return function stripped(file, lang, mode) {
      let entry = cache.get(file);
      if (!entry) {
        entry = { regions: scanRegions(file.content, lang), comments: null, both: null };
        cache.set(file, entry);
      }
      if (mode === "comments") {
        if (entry.comments === null) entry.comments = blank(file.content, entry.regions.comments);
        return entry.comments;
      }
      if (entry.both === null) {
        entry.both = blank(file.content, entry.regions.comments.concat(entry.regions.strings));
      }
      return entry.both;
    };
  }

  // Graph building is pure CPU on the main thread; without these yields a
  // large C#/Razor project freezes the tab for the whole run.
  const YIELD_EVERY = 25;
  function yieldToEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  // ============================================================
  // tree-sitter bridge — batches file text to background.js, which hosts
  // the WASM parsers (see the header comment for why a service worker).
  // Returns Map<relativePath, facts> — facts per background.js's protocol
  // ({ ok, namespace, usings, definitions, identifiers } for cs;
  // { ok, imports } for js) — or null on ANY batch failure, which callers
  // treat as "this language falls back to regex wholesale".
  // ============================================================
  const TS_BATCH_MAX_FILES = 50;
  const TS_BATCH_MAX_CHARS = 1500000;

  async function parseViaTreeSitter(lang, files) {
    if (!files.length) return new Map();
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return null;
    const facts = new Map();
    let batch = [];
    let chars = 0;
    const flush = async () => {
      if (!batch.length) return;
      const payload = batch.map((f) => ({ path: f.relativePath, content: f.content }));
      batch = [];
      chars = 0;
      const resp = await chrome.runtime.sendMessage({ type: "ccbTsParse", lang, files: payload });
      if (!resp || !resp.ok) throw new Error((resp && resp.error) || "no response from parser worker");
      for (const r of resp.results) facts.set(r.path, r);
    };
    try {
      for (const f of files) {
        batch.push(f);
        chars += f.content.length;
        if (batch.length >= TS_BATCH_MAX_FILES || chars >= TS_BATCH_MAX_CHARS) await flush();
      }
      await flush();
      return facts;
    } catch (_e) {
      return null;
    }
  }

  // ============================================================
  // JS / TS / JSX — import & require resolution
  // ============================================================
  const JS_IMPORT_PATTERNS = [
    /import\s+[^'"()]*?\bfrom\s*["']([^"']+)["']/g,
    /export\s+[^'"()]*?\bfrom\s*["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  // Returns null when `..` segments climb past the scanned root — the target
  // lives outside the project, and mapping it back into the root used to
  // create a false edge whenever an unrelated in-project file shared the name.
  function joinRelative(fromPath, importPath) {
    const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    const combined = (baseDir ? baseDir + "/" : "") + importPath;
    const stack = [];
    for (const part of combined.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (!stack.length) return null;
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  // `@/foo` and `~/foo` are the conventional Vite/Vue/Nuxt/webpack alias
  // forms for "project source root" — resolved without needing to parse
  // tsconfig/webpack config. Returns the aliased remainder, or null if
  // importPath isn't in alias form.
  function stripLeadingAlias(importPath) {
    const m = /^[@~]\/(.+)$/.exec(importPath);
    return m ? m[1] : null;
  }

  // Tries exact-case matches first (all candidates), then falls back to a
  // case-insensitive match (all candidates) — so an exact-case hit always
  // wins, but `import './Header'` still resolves against `header.jsx` on
  // filesystems where the project itself is case-insensitive.
  function findCandidate(base, resolver) {
    const candidates = [
      base,
      `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.cjs`,
      `${base}/index.js`, `${base}/index.jsx`, `${base}/index.ts`, `${base}/index.tsx`,
    ];
    for (const c of candidates) {
      if (resolver.pathIndex.has(c)) return c;
    }
    for (const c of candidates) {
      const hit = resolver.lowerIndex.get(c.toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  function resolveJsImport(fromPath, importPath, resolver) {
    if (importPath.startsWith(".")) {
      const joined = joinRelative(fromPath, importPath);
      return joined === null ? null : findCandidate(joined, resolver);
    }
    const aliasRest = stripLeadingAlias(importPath);
    if (aliasRest === null) return null; // external package / unresolvable alias
    return findCandidate(`src/${aliasRest}`, resolver) || findCandidate(aliasRest, resolver);
  }

  function analyzeJsFile(file, resolver, stripped) {
    const cleaned = stripped(file, "js", "comments");
    const deps = new Set();
    for (const re of JS_IMPORT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(cleaned))) {
        const resolved = resolveJsImport(file.relativePath, m[1], resolver);
        if (resolved && resolved !== file.relativePath) deps.add(resolved);
      }
    }
    return Array.from(deps);
  }

  // AST-side twin of analyzeJsFile: import specifiers come straight from
  // import/export/require/dynamic-import nodes; resolution is shared.
  function analyzeJsFileFromFacts(file, facts, resolver) {
    const deps = new Set();
    for (const spec of facts.imports) {
      const resolved = resolveJsImport(file.relativePath, spec, resolver);
      if (resolved && resolved !== file.relativePath) deps.add(resolved);
    }
    return Array.from(deps);
  }

  // Extensions eligible for tree-sitter JS parsing. The javascript grammar
  // includes JSX; .ts/.tsx are excluded by scope decision (see header).
  const JS_AST_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs"]);

  // ============================================================
  // C# — namespace/class symbol table + best-effort reference scan
  // ============================================================
  // Modifier list includes readonly/ref/new/unsafe/file so declarations like
  // `readonly record struct X` / `ref struct X` / `file class X` register.
  // `record(?:\s+(?:class|struct))?` handles C# 10 `record class` / `record
  // struct` — without it, `record struct Point` captured the keyword "struct"
  // as the type name, poisoning the symbol table with a name that appears in
  // nearly every file that declares any struct.
  const CS_TYPE_RE = /(?:^|\n)[ \t]*(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|ref|new|unsafe|file)\s+)*(?:class|interface|struct|enum|record(?:\s+(?:class|struct))?)\s+([A-Za-z_]\w*)/g;
  const CS_NAMESPACE_RE = /\bnamespace\s+([A-Za-z_][\w.]*)\s*[{;]/;
  const CS_USING_RE = /\busing\s+(?:static\s+)?([A-Za-z_][\w.]*)\s*;/g;

  function extractCsNamespace(cleaned) {
    const m = CS_NAMESPACE_RE.exec(cleaned);
    return m ? m[1] : "";
  }

  function extractCsUsings(cleaned) {
    CS_USING_RE.lastIndex = 0;
    const usings = [];
    let m;
    while ((m = CS_USING_RE.exec(cleaned))) usings.push(m[1]);
    return usings;
  }

  // Hybrid: AST facts when tree-sitter parsed the file, regex otherwise —
  // per file, so one unparseable file doesn't degrade the whole table.
  // csFacts may be null (language-level parser failure → all-regex).
  function buildCsharpSymbolTable(files, stripped, csFacts) {
    const bySimpleName = {};
    const add = (name, file, namespace) => {
      if (!bySimpleName[name]) bySimpleName[name] = [];
      bySimpleName[name].push({ file, namespace });
    };
    for (const file of files) {
      const facts = csFacts ? csFacts.get(file.relativePath) : null;
      if (facts && facts.ok) {
        for (const name of facts.definitions) add(name, file.relativePath, facts.namespace || "");
        continue;
      }
      // "both" (comments + strings blanked): a multi-line verbatim string
      // containing `class X` at line start (code-gen templates) must not
      // register a phantom type. Blanking preserves offsets/newlines, so the
      // (?:^|\n) anchors and namespace extraction still line up.
      const cleaned = stripped(file, "cs", "both");
      const namespace = extractCsNamespace(cleaned);
      CS_TYPE_RE.lastIndex = 0;
      let m;
      while ((m = CS_TYPE_RE.exec(cleaned))) add(m[1], file.relativePath, namespace);
    }
    return { bySimpleName };
  }

  // AST-side twin of analyzeCsharpFile: same candidate-preference logic, but
  // matched names come from real identifier nodes (strings/comments/partial
  // word hits are impossible by construction) and namespace/usings come from
  // the AST rather than regex.
  function analyzeCsharpFileFromFacts(file, facts, symbolTable) {
    const deps = new Set();
    for (const name of facts.identifiers) {
      const candidates = symbolTable.bySimpleName[name];
      if (!candidates) continue;
      const preferred = candidates.filter(
        (cand) => cand.namespace === (facts.namespace || "") || facts.usings.includes(cand.namespace),
      );
      const chosen = preferred.length ? preferred : candidates; // ambiguous → include all
      for (const cand of chosen) {
        if (cand.file !== file.relativePath) deps.add(cand.file);
      }
    }
    return Array.from(deps);
  }

  function analyzeCsharpFile(file, symbolTable, stripped, combined) {
    const names = Object.keys(symbolTable.bySimpleName);
    if (!names.length) return [];

    const cleaned = stripped(file, "cs", "comments");
    const ownNamespace = extractCsNamespace(cleaned);
    const usings = extractCsUsings(cleaned);

    const cleanedNoStrings = stripped(file, "cs", "both");
    combined.lastIndex = 0;
    const matched = new Set();
    let m;
    while ((m = combined.exec(cleanedNoStrings))) matched.add(m[1]);

    const deps = new Set();
    for (const name of matched) {
      const candidates = symbolTable.bySimpleName[name] || [];
      const preferred = candidates.filter(
        (cand) => cand.namespace === ownNamespace || usings.includes(cand.namespace),
      );
      const chosen = preferred.length ? preferred : candidates; // ambiguous → include all
      for (const cand of chosen) {
        if (cand.file !== file.relativePath) deps.add(cand.file);
      }
    }
    return Array.from(deps);
  }

  // ============================================================
  // Razor (.cshtml/.razor) — consumes the C# symbol table; declares no
  // types of its own, just references them via @model/@inject/tag helpers/
  // embedded C# blocks. Filtered by @using directives, same idea as C#.
  // ============================================================
  const RAZOR_EXTENSIONS = new Set(["cshtml", "razor"]);
  const RAZOR_USING_RE = /@using\s+(?:static\s+)?([A-Za-z_][\w.]*)\s*;?/g;

  function extractRazorUsings(cleaned) {
    RAZOR_USING_RE.lastIndex = 0;
    const usings = [];
    let m;
    while ((m = RAZOR_USING_RE.exec(cleaned))) usings.push(m[1]);
    return usings;
  }

  function analyzeRazorFile(file, symbolTable, stripped, combined) {
    const names = Object.keys(symbolTable.bySimpleName);
    if (!names.length) return [];

    const cleaned = stripped(file, "razor", "comments");
    const usings = extractRazorUsings(cleaned);

    combined.lastIndex = 0;
    const matched = new Set();
    let m;
    while ((m = combined.exec(cleaned))) matched.add(m[1]);

    const deps = new Set();
    for (const name of matched) {
      const candidates = symbolTable.bySimpleName[name] || [];
      const preferred = usings.length ? candidates.filter((cand) => usings.includes(cand.namespace)) : [];
      const chosen = preferred.length ? preferred : candidates; // ambiguous → include all
      for (const cand of chosen) {
        if (cand.file !== file.relativePath) deps.add(cand.file);
      }
    }
    return Array.from(deps);
  }

  // ============================================================
  // Public API
  // ============================================================
  async function buildGraph(included) {
    const startedAt = Date.now();
    const pathIndex = new Set(included.map((f) => f.relativePath));
    const lowerIndex = new Map();
    for (const p of pathIndex) {
      const lower = p.toLowerCase();
      if (!lowerIndex.has(lower)) lowerIndex.set(lower, p); // first match wins on collision
    }
    const resolver = { pathIndex, lowerIndex };
    const graph = {};
    const stripped = createRegionCache();
    let sinceYield = 0;
    const maybeYield = async () => {
      if (++sinceYield < YIELD_EVERY) return;
      sinceYield = 0;
      await yieldToEventLoop();
    };

    const jsFiles = included.filter((f) => JS_EXTENSIONS.has(ext(f.relativePath)));
    // One parse round-trip per language, up front (batched inside).
    // null → that language's parser is unavailable → regex wholesale.
    const jsFacts = await parseViaTreeSitter(
      "js",
      jsFiles.filter((f) => JS_AST_EXTENSIONS.has(ext(f.relativePath))),
    );
    let jsAst = 0;
    for (const file of jsFiles) {
      const facts = jsFacts ? jsFacts.get(file.relativePath) : null;
      if (facts && facts.ok) {
        graph[file.relativePath] = analyzeJsFileFromFacts(file, facts, resolver);
        jsAst++;
      } else {
        graph[file.relativePath] = analyzeJsFile(file, resolver, stripped);
      }
      await maybeYield();
    }

    const csFiles = included.filter((f) => ext(f.relativePath) === "cs");
    const razorFiles = included.filter((f) => RAZOR_EXTENSIONS.has(ext(f.relativePath)));
    let csAst = 0;
    if (csFiles.length || razorFiles.length) {
      const csFacts = await parseViaTreeSitter("cs", csFiles);
      const symbolTable = buildCsharpSymbolTable(csFiles, stripped, csFacts);
      // One combined regex for the whole run — it only depends on the symbol
      // table, so rebuilding it per file (as before) recompiled a pattern
      // holding every type name in the project, once for every file. Still
      // needed even on the AST path: razor files (no grammar) and any cs
      // file tree-sitter couldn't parse scan with it.
      const names = Object.keys(symbolTable.bySimpleName);
      const combined = names.length
        ? new RegExp(`\\b(${names.map(escapeRegex).join("|")})\\b`, "g")
        : null;
      for (const file of csFiles) {
        const facts = csFacts ? csFacts.get(file.relativePath) : null;
        if (facts && facts.ok) {
          graph[file.relativePath] = analyzeCsharpFileFromFacts(file, facts, symbolTable);
          csAst++;
        } else {
          graph[file.relativePath] = combined ? analyzeCsharpFile(file, symbolTable, stripped, combined) : [];
        }
        await maybeYield();
      }
      for (const file of razorFiles) {
        graph[file.relativePath] = combined ? analyzeRazorFile(file, symbolTable, stripped, combined) : [];
        await maybeYield();
      }
    }

    // Code-behind pairing: Foo.cshtml<->Foo.cshtml.cs / Foo.razor<->Foo.razor.cs
    // are one logical unit split across two files — link them regardless of
    // whether either side textually references the other's types.
    for (const file of razorFiles) {
      const codeBehind = file.relativePath + ".cs";
      if (!pathIndex.has(codeBehind)) continue;
      const viewDeps = new Set(graph[file.relativePath] || []);
      viewDeps.add(codeBehind);
      graph[file.relativePath] = Array.from(viewDeps);
      const codeBehindDeps = new Set(graph[codeBehind] || []);
      codeBehindDeps.add(file.relativePath);
      graph[codeBehind] = Array.from(codeBehindDeps);
    }

    for (const file of included) {
      if (!graph[file.relativePath]) graph[file.relativePath] = [];
    }
    // Timing/operation log only — counts/ms, never paths or content.
    // csAst/jsAst = files whose symbols came from tree-sitter; the rest of
    // each language's count fell back to regex. Both zero + nonzero files
    // usually means the background worker/WASM failed to load.
    console.log("[ccb-timing] dep-graph.buildGraph", {
      files: included.length,
      csAst,
      csTotal: csFiles.length,
      jsAst,
      jsTotal: jsFiles.length,
      ms: Date.now() - startedAt,
    });
    return graph;
  }

  function getTransitiveClosure(graph, startPath) {
    const visited = new Set();
    const queue = [startPath];
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of graph[current] || []) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }
    return visited;
  }

  // Inverts { file: [deps] } into { file: [dependents] } — every file that
  // depends on `file`, one hop. Built fresh each call (graphs are small path
  // lists, not worth caching against edits made via loadWithDependencies).
  function reverseGraph(graph) {
    const rev = {};
    for (const file in graph) rev[file] = [];
    for (const file in graph) {
      for (const dep of graph[file]) {
        if (!rev[dep]) rev[dep] = [];
        rev[dep].push(file);
      }
    }
    return rev;
  }

  function getDirectDependents(graph, startPath) {
    const rev = reverseGraph(graph);
    return new Set(rev[startPath] || []);
  }

  function getFullContext(graph, startPath) {
    const closure = getTransitiveClosure(graph, startPath);
    const rev = reverseGraph(graph);
    for (const dependent of rev[startPath] || []) closure.add(dependent);
    return closure;
  }

  window.__ccbDepGraph = {
    buildGraph,
    getTransitiveClosure,
    getDirectDependents,
    getFullContext,
  };
})();
