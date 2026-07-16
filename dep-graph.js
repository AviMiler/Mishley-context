// dep-graph.js — static, no-AI dependency graph for scanned code projects.
// Resolves JS/TS/JSX import & require statements to files (deterministic,
// high-confidence), and C# class/namespace references via a symbol table
// (heuristic, best-effort — favors including too much over missing a file).
// Neither is 100% — dynamic dispatch (computed member access, reflection,
// eval, virtual/interface calls) can't be resolved statically. See CLAUDE.md.
// JS resolution also handles `@/`/`~/` alias imports (tried against `src/`
// first, then project root) and is case-insensitive as a fallback, since
// real filesystems the extension runs on (Windows/macOS) are.
// Exposes: window.__ccbDepGraph
//
// Public API:
//   buildGraph(included) — included: [{relativePath, content, ...}] from
//     scanCodeProject (called while file content is still in memory).
//     Returns { [relativePath]: string[] } — file -> files it depends on.
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

      if ((mode === "code" || mode === "templateExpr" || mode === "interpExpr") && c === "/" && c2 === "/") {
        const s = i; i += 2;
        while (i < n && text[i] !== "\n") i++;
        comments.push([s, i]);
        continue;
      }
      if ((mode === "code" || mode === "templateExpr" || mode === "interpExpr") && c === "/" && c2 === "*") {
        const s = i; i += 2;
        while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i = Math.min(i + 2, n);
        comments.push([s, i]);
        continue;
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

  function stripComments(text, lang) {
    return blank(text, scanRegions(text, lang).comments);
  }

  function stripCommentsAndStrings(text, lang) {
    const { comments, strings } = scanRegions(text, lang);
    return blank(text, comments.concat(strings));
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

  function joinRelative(fromPath, importPath) {
    const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    const combined = (baseDir ? baseDir + "/" : "") + importPath;
    const stack = [];
    for (const part of combined.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
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
      return findCandidate(joinRelative(fromPath, importPath), resolver);
    }
    const aliasRest = stripLeadingAlias(importPath);
    if (aliasRest === null) return null; // external package / unresolvable alias
    return findCandidate(`src/${aliasRest}`, resolver) || findCandidate(aliasRest, resolver);
  }

  function analyzeJsFile(file, resolver) {
    const cleaned = stripComments(file.content, "js");
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

  // ============================================================
  // C# — namespace/class symbol table + best-effort reference scan
  // ============================================================
  const CS_TYPE_RE = /(?:^|\n)[ \t]*(?:(?:public|private|protected|internal|static|abstract|sealed|partial)\s+)*(?:class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/g;
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

  function buildCsharpSymbolTable(files) {
    const bySimpleName = {};
    for (const file of files) {
      const cleaned = stripComments(file.content, "cs");
      const namespace = extractCsNamespace(cleaned);
      CS_TYPE_RE.lastIndex = 0;
      let m;
      while ((m = CS_TYPE_RE.exec(cleaned))) {
        const name = m[1];
        if (!bySimpleName[name]) bySimpleName[name] = [];
        bySimpleName[name].push({ file: file.relativePath, namespace });
      }
    }
    return { bySimpleName };
  }

  function analyzeCsharpFile(file, symbolTable) {
    const names = Object.keys(symbolTable.bySimpleName);
    if (!names.length) return [];

    const cleaned = stripComments(file.content, "cs");
    const ownNamespace = extractCsNamespace(cleaned);
    const usings = extractCsUsings(cleaned);

    const cleanedNoStrings = stripCommentsAndStrings(file.content, "cs");
    const combined = new RegExp(`\\b(${names.map(escapeRegex).join("|")})\\b`, "g");
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
  // Public API
  // ============================================================
  function buildGraph(included) {
    const pathIndex = new Set(included.map((f) => f.relativePath));
    const lowerIndex = new Map();
    for (const p of pathIndex) {
      const lower = p.toLowerCase();
      if (!lowerIndex.has(lower)) lowerIndex.set(lower, p); // first match wins on collision
    }
    const resolver = { pathIndex, lowerIndex };
    const graph = {};

    const jsFiles = included.filter((f) => JS_EXTENSIONS.has(ext(f.relativePath)));
    for (const file of jsFiles) {
      graph[file.relativePath] = analyzeJsFile(file, resolver);
    }

    const csFiles = included.filter((f) => ext(f.relativePath) === "cs");
    if (csFiles.length) {
      const symbolTable = buildCsharpSymbolTable(csFiles);
      for (const file of csFiles) {
        graph[file.relativePath] = analyzeCsharpFile(file, symbolTable);
      }
    }

    for (const file of included) {
      if (!graph[file.relativePath]) graph[file.relativePath] = [];
    }
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
