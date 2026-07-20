// document-handler.js — Document management for projects
// Handles file uploads, URL links, content paste, and token estimation.
// Exports: window.__ccbDocHandler
//
// Public API:
//   init(deps)                         — initialize with shared state
//   addDocument(file, projectId, content?) — add a new document
//   removeDocument(projectId, docId)   — remove a document
//   toggleDocument(projectId, docId, enabled) — toggle document inclusion
//   getDocumentContent(projectId, docId)    — retrieve full content for injection
//   getCodeContents(docIds)            — batched read of many code files' text (Map<docId, text>)
//   estimateTokens(content, type)      — estimate tokens for content
//   scanCodeProject(dirHandle, scanSettings?) — recursively scan a code project folder
//                                      ({ ignorePatterns, denyDirs, denyFilenames, codeExtensions,
//                                         maxFileSizeKb, onProgress(done, total) })
//   getDefaultScanSettings()           — the built-in scan rules, for first-load seeding + "reset to defaults"
//   buildStructureMarkdown(included, rootName) — render a folder tree as markdown
//   syncCodeProjectDocuments(project, included, rootName) — upsert scanned files into project.documents
//   removeCodeContent(docId)           — delete a code file's stored content (e.g. on bookmark removal)

(() => {
  "use strict";

  let _deps = null;
  const CHARS_PT = 3.5;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  // Scan throughput tuning. Every directory listing, file read, and storage
  // write is an IPC round-trip to the browser process, so the limiting factor
  // on a large project is round-trip latency, not CPU. These caps keep enough
  // work in flight to hide that latency without flooding the IO queue.
  const DIR_CONCURRENCY = 8;
  const FILE_READ_CONCURRENCY = 12;
  const CONTENT_WRITE_BATCH = 50; // files per chrome.storage.local.set call

  // Runs `worker` over `items` with at most `limit` in flight at a time.
  async function runWithConcurrency(items, limit, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    });
    await Promise.all(runners);
  }

  // Breadth-first directory traversal with a GLOBAL concurrency cap.
  // `visit(handle, pathParts)` resolves to the subdirectories to enqueue.
  // The queue is flat rather than recursive on purpose: recursing into a
  // concurrency-limited helper per level would multiply the limit by itself
  // once per directory depth, so a deep tree would end up with thousands of
  // simultaneous reads instead of `limit`.
  function walkDirectories(rootHandle, limit, visit) {
    const queue = [[rootHandle, []]];
    let cursor = 0;
    let active = 0;
    let failure = null;

    return new Promise((resolve, reject) => {
      const pump = () => {
        while (!failure && active < limit && cursor < queue.length) {
          const [handle, pathParts] = queue[cursor++];
          active++;
          visit(handle, pathParts)
            .then((subdirs) => { for (const sub of subdirs) queue.push(sub); })
            .catch((e) => { failure = failure || e; })
            .finally(() => { active--; pump(); });
        }
        if (active === 0 && (failure || cursor >= queue.length)) {
          failure ? reject(failure) : resolve();
        }
      };
      pump();
    });
  }

  // ============================================================
  // Code project scanning — DEFAULT filters for scanCodeProject()
  //
  // These are seed/reset values only, NOT the live source of truth. On first
  // load content.js copies them into chrome.storage.local["ccb_scanSettings"],
  // after which the user can edit them from the Advanced Options settings
  // dialog and the stored version is what every scan actually uses (passed in
  // via scanCodeProject's `scanSettings` argument). getDefaultScanSettings()
  // exposes them for that initial seeding and for the dialog's
  // "reset to defaults" button.
  // ============================================================
  const DEFAULT_MAX_FILE_SIZE_KB = 200; // larger is likely generated/minified

  const DEFAULT_DENY_DIRS = [
    "node_modules", ".git", ".svn", ".hg", "dist", "build", "out", ".next", ".nuxt", ".output",
    "coverage", ".nyc_output", ".cache", ".parcel-cache", ".turbo", "vendor", "venv", ".venv", "env",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".idea", ".vscode", ".vs", "bin", "obj", "target",
    ".gradle", ".terraform", ".angular", ".svelte-kit", ".yarn", ".pnp", "logs", "tmp", "temp",
    ".serverless", ".vercel", ".netlify",
  ];

  const DEFAULT_DENY_FILENAMES = [
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Cargo.lock", "poetry.lock",
    "Pipfile.lock", "composer.lock", "package.json", "tsconfig*.json", "jsconfig.json", ".eslintrc*",
    "eslint.config.*", ".prettierrc*", "prettier.config.*", "babel.config.*", ".babelrc*",
    "webpack.config.*", "vite.config.*", "rollup.config.*", "next.config.*", "nuxt.config.*",
    "svelte.config.*", "tailwind.config.*", "postcss.config.*", "jest.config.*", "jest.setup.*",
    "vitest.config.*", "karma.conf.*", "metro.config.*", "angular.json", "nx.json", "lerna.json",
    "turbo.json", "commitlint.config.*", ".env*", ".editorconfig", ".nvmrc", ".npmrc", ".yarnrc*",
    ".gitignore", ".gitattributes", ".gitmodules", "Dockerfile*", "docker-compose*.y*ml",
    ".dockerignore", "Makefile", "Procfile", "LICENSE*", "README*", "CHANGELOG*", "CONTRIBUTING*",
  ];

  const DEFAULT_CODE_EXTENSIONS = [
    "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "svelte", "py", "rb", "java", "kt", "kts", "go",
    "rs", "php", "c", "h", "cc", "cpp", "hpp", "cs", "swift", "m", "mm", "scala", "sh", "bash", "zsh",
    "ps1", "sql", "html", "htm", "css", "scss", "sass", "less", "graphql", "gql", "proto",
    "cshtml", "razor", "json",
  ];

  // Fresh copies every call — the caller stores these and would otherwise be
  // mutating the module's own defaults (breaking "reset to defaults" later).
  function getDefaultScanSettings() {
    return {
      denyDirs: [...DEFAULT_DENY_DIRS],
      denyFilenames: [...DEFAULT_DENY_FILENAMES],
      codeExtensions: [...DEFAULT_CODE_EXTENSIONS],
      maxFileSizeKb: DEFAULT_MAX_FILE_SIZE_KB,
    };
  }

  // Pattern matching shared by every scan filter (project ignorePatterns, and
  // the user-editable global denyDirs/denyFilenames). Plain names or globs
  // (`*`), matched case-insensitively against either the bare file/dir name or
  // its full relative path from the project root, so both "src/legacy" and
  // "*.spec.js" work.
  function buildPatternMatchers(patterns) {
    return (patterns || [])
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .map((p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i"));
  }

  function matchesPatterns(name, relativePath, matchers) {
    if (!matchers.length) return false;
    return matchers.some((re) => re.test(name) || re.test(relativePath));
  }

  // ============================================================
  // chrome.storage.local — stores file blobs as base64 data URLs
  // Requires "unlimitedStorage" permission in manifest.json
  // Key format: docBlob_<docId>
  // ============================================================
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mimeType = meta.match(/:(.*?);/)?.[1] || "application/octet-stream";
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
  }

  function idbPut(docId, blob, name, mimeType) {
    return blobToDataUrl(blob).then(dataUrl =>
      new Promise((resolve, reject) =>
        chrome.storage.local.set({ [`docBlob_${docId}`]: { dataUrl, name, mimeType } }, () =>
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
        )
      )
    );
  }

  function idbGet(docId) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.get([`docBlob_${docId}`], result => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result[`docBlob_${docId}`] || null);
      })
    );
  }

  function idbDelete(docId) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.remove([`docBlob_${docId}`], () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
      )
    );
  }

  // ============================================================
  // chrome.storage.local — code-project file content, one key per file.
  // Code projects can have hundreds of files; keeping their text out of the
  // `blocks` object (instead of inline on doc.content) keeps every unrelated
  // saveBlocks() call (toggling a checkbox, renaming a project, etc.) fast,
  // since it no longer has to re-serialize every scanned file on every write.
  // Key format: codeContent_<docId>
  // ============================================================
  function codeContentKey(docId) {
    return `codeContent_${docId}`;
  }

  function codeContentGet(docId) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.get([codeContentKey(docId)], (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result[codeContentKey(docId)] ?? null);
      })
    );
  }

  // Batched sibling of codeContentGet: one chrome.storage.local.get for every
  // requested file instead of one per file. Each get is an IPC round-trip to
  // the browser process, so injecting a few hundred selected code files used
  // to cost a few hundred sequential round-trips.
  // Returns Map<docId, content> — docIds with no stored content are absent.
  function codeContentGetMany(docIds) {
    const ids = Array.from(new Set(docIds || []));
    if (!ids.length) return Promise.resolve(new Map());
    return new Promise((resolve, reject) =>
      chrome.storage.local.get(ids.map(codeContentKey), (result) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        const out = new Map();
        for (const id of ids) {
          const value = result[codeContentKey(id)];
          if (value != null) out.set(id, value);
        }
        resolve(out);
      })
    );
  }

  function codeContentRemove(docId) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.remove([codeContentKey(docId)], () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
      )
    );
  }

  function codeContentRemoveMany(docIds) {
    const keys = (docIds || []).map(codeContentKey);
    if (!keys.length) return Promise.resolve();
    return new Promise((resolve, reject) =>
      chrome.storage.local.remove(keys, () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
      )
    );
  }

  // Writes an already-keyed { codeContent_<id>: text } map in fixed-size
  // batches. Batched rather than one giant set() so a single failure can't
  // lose the whole scan and peak serialization memory stays bounded.
  async function codeContentPutMany(keyedContent, onProgress = null) {
    const keys = Object.keys(keyedContent);
    for (let i = 0; i < keys.length; i += CONTENT_WRITE_BATCH) {
      const batch = {};
      for (const key of keys.slice(i, i + CONTENT_WRITE_BATCH)) batch[key] = keyedContent[key];
      if (onProgress) onProgress({ phase: "save", done: i, total: keys.length });
      await new Promise((resolve, reject) =>
        chrome.storage.local.set(batch, () =>
          chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
        )
      );
    }
    // Final tick so the bar lands on 100% rather than on the last batch start.
    if (onProgress && keys.length) onProgress({ phase: "save", done: keys.length, total: keys.length });
  }

  // ============================================================
  // Token Estimation (reuses logic from ctx-meter.js)
  // ============================================================
  function estimateTokensForContent(content) {
    if (typeof content !== "string") return 0;
    return Math.ceil(content.length / CHARS_PT);
  }

  function estimateTokensForFile(file) {
    // Text files: read and estimate by character count
    if (isLikelyTextFile(file)) {
      return file.text()
        .then(text => Math.ceil(text.length / CHARS_PT))
        .catch(() => Math.ceil(file.size / CHARS_PT));
    }

    // Binary files: use size-based heuristics (from ctx-meter.js)
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    const size = file.size || 0;

    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|svg)$/i.test(name)) {
      if (size < 100 * 1024) return Promise.resolve(85);
      if (size < 500 * 1024) return Promise.resolve(400);
      if (size < 2 * 1024 * 1024) return Promise.resolve(1100);
      return Promise.resolve(1600);
    }

    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      return Promise.resolve(Math.ceil(size / 50));
    }

    if (/\.(pptx?|odp)$/i.test(name) || type.includes("presentation")) {
      return Promise.resolve(Math.ceil(size / 200));
    }

    if (/\.(docx?|odt|rtf)$/i.test(name) || type.includes("wordprocessingml") || type.includes("msword")) {
      return Promise.resolve(Math.ceil(size / 100));
    }

    if (/\.(xlsx?|ods|csv)$/i.test(name) || type.includes("spreadsheet") || type.includes("ms-excel")) {
      return Promise.resolve(Math.ceil(size / 120));
    }

    if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(name)) {
      return Promise.resolve(Math.ceil(size / 100));
    }

    if (type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv|3gp)$/i.test(name)) {
      return Promise.resolve(Math.ceil(size / 200));
    }

    if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(name) || type.includes("zip") || type.includes("compressed") || type.includes("archive")) {
      return Promise.resolve(Math.ceil(size / 300));
    }

    // Markup & Code
    if (/\.(html?|xml|svg|yaml|yml|toml|ini|conf|cfg)$/i.test(name) || type === "application/xml" || type === "text/xml" || type === "image/svg+xml") {
      return file.text()
        .then(text => Math.ceil(text.length / (CHARS_PT * 1.2)))
        .catch(() => Math.ceil(size / CHARS_PT));
    }

    // Fallback
    return Promise.resolve(Math.ceil(size / 50));
  }

  // ============================================================
  // Office document text extraction (DOCX / ODT / XLSX)
  // DOCX and ODT are ZIP archives — we extract XML then strip tags.
  // Uses DecompressionStream('deflate-raw') available in Chrome 80+.
  // ============================================================
  async function inflateRaw(data) {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(data);
    writer.close();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }

  // Read a named entry from a ZIP using the Central Directory.
  // The CD always has correct sizes even when local headers use data descriptors (size=0).
  async function readZipEntry(arrayBuffer, entryName) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const dec = new TextDecoder("utf-8");

    // Locate End of Central Directory by scanning backwards
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return null;

    const cdOffset = view.getUint32(eocd + 16, true);
    const cdCount  = view.getUint16(eocd + 10, true);

    let cdPos = cdOffset;
    for (let i = 0; i < cdCount; i++) {
      if (cdPos + 46 > bytes.length) break;
      if (view.getUint32(cdPos, true) !== 0x02014b50) break;
      const compression    = view.getUint16(cdPos + 10, true);
      const compressedSize = view.getUint32(cdPos + 20, true);
      const nameLen        = view.getUint16(cdPos + 28, true);
      const extraLen       = view.getUint16(cdPos + 30, true);
      const commentLen     = view.getUint16(cdPos + 32, true);
      const localOffset    = view.getUint32(cdPos + 42, true);
      const name = dec.decode(bytes.slice(cdPos + 46, cdPos + 46 + nameLen));

      if (name === entryName) {
        // Skip past the local file header to get the actual data start
        const localNameLen  = view.getUint16(localOffset + 26, true);
        const localExtraLen = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const compressed = bytes.slice(dataStart, dataStart + compressedSize);
        if (compression === 0) return compressed;
        if (compression === 8) return inflateRaw(compressed);
        return null;
      }

      cdPos += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  }

  function stripXmlToText(xml, paragraphTag) {
    return xml
      .replace(new RegExp(`</${paragraphTag}>`, "g"), "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, " ").replace(/\n /g, "\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  async function readDocxText(file) {
    try {
      const ab = await file.arrayBuffer();
      const xmlBytes = await readZipEntry(ab, "word/document.xml");
      if (!xmlBytes) return null;
      const xml = new TextDecoder("utf-8").decode(xmlBytes);
      return stripXmlToText(xml, "w:p");
    } catch (e) {
      console.warn("[document-handler] readDocxText failed", e);
      return null;
    }
  }

  async function readOdtText(file) {
    try {
      const ab = await file.arrayBuffer();
      const xmlBytes = await readZipEntry(ab, "content.xml");
      if (!xmlBytes) return null;
      const xml = new TextDecoder("utf-8").decode(xmlBytes);
      return stripXmlToText(xml, "text:p");
    } catch (e) {
      console.warn("[document-handler] readOdtText failed", e);
      return null;
    }
  }

  async function readRtfText(file) {
    try {
      const raw = await file.text();
      // Strip RTF control words, groups, and non-ASCII escapes
      return raw
        .replace(/\{[^{}]*\}/g, " ")       // remove groups
        .replace(/\\[a-z]+\-?\d*\s?/gi, "") // control words
        .replace(/\\\*/g, "")
        .replace(/[{}\\]/g, "")
        .replace(/\\'[0-9a-f]{2}/gi, " ")  // hex escapes
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n").trim();
    } catch (e) {
      return null;
    }
  }

  async function extractOfficeText(file, fileType) {
    const name = (file.name || "").toLowerCase();
    if (fileType === "word") {
      if (/\.docx$/i.test(name) || /\.(docm|dotx|dotm)$/i.test(name)) return readDocxText(file);
      if (/\.odt$/i.test(name)) return readOdtText(file);
      if (/\.rtf$/i.test(name)) return readRtfText(file);
      if (/\.doc$/i.test(name)) return null; // legacy binary .doc — not supported
    }
    return null;
  }

  function isLikelyTextFile(file) {
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    return (
      type.startsWith("text/") ||
      type === "application/json" ||
      type === "application/xml" ||
      type === "image/svg+xml" ||
      /\.(txt|md|markdown|py|js|ts|jsx|tsx|json|csv|xml|html|htm|css|scss|sass|less|java|c|cpp|h|hpp|rs|go|rb|sh|yaml|yml|sql|ini|toml|env|log)$/i.test(name)
    );
  }

  function getFileType(file) {
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();

    if (type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|svg)$/i.test(name)) {
      return "image";
    }
    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      return "pdf";
    }
    if (/\.(pptx?|odp)$/i.test(name)) {
      return "presentation";
    }
    if (/\.(docx?|odt|rtf)$/i.test(name)) {
      return "word";
    }
    if (/\.(xlsx?|ods|csv)$/i.test(name)) {
      return "spreadsheet";
    }
    if (type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(name)) {
      return "audio";
    }
    if (type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv|3gp)$/i.test(name)) {
      return "video";
    }
    if (isLikelyTextFile(file)) {
      return "text";
    }
    return "file";
  }

  // ============================================================
  // Document lifecycle
  // ============================================================
  async function addDocument(file, projectId, contentOverride = null) {
    if (!_deps) return null;
    const startedAt = Date.now();

    const isRealFile = file instanceof File || file instanceof Blob;

    // 10 MB size check for real files
    if (isRealFile && file.size > MAX_FILE_SIZE) {
      throw new Error(`הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)} MB). מקסימום 10 MB.`);
    }

    await _deps.loadBlocks();
    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return null;

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fileType = getFileType(file);

    // Read text content first — used for both token estimation and injection
    const readStartedAt = Date.now();
    let content = null;
    let preview = "";
    try {
      if (contentOverride !== null) {
        content = contentOverride;
      } else if (isRealFile && isLikelyTextFile(file)) {
        content = await file.text();
      } else if (isRealFile && fileType === "word") {
        content = await extractOfficeText(file, fileType);
      }
      preview = content ? content.slice(0, 200).replace(/\n/g, " ") : "";
    } catch (e) {
      console.error("[document-handler] addDocument: failed to read file content", e);
    }
    const readMs = Date.now() - readStartedAt;

    let estimatedTokens = 0;
    if (content !== null) {
      estimatedTokens = estimateTokensForContent(content);
    } else {
      estimatedTokens = await estimateTokensForFile(file);
    }

    // Store blob in IndexedDB so we can inject it into the chat's file input later
    const blobStartedAt = Date.now();
    let hasBlob = false;
    if (isRealFile) {
      try {
        await idbPut(docId, file, file.name, file.type || "application/octet-stream");
        hasBlob = true;
      } catch (e) {
        console.error("[document-handler] addDocument: failed to store blob", e);
      }
    }
    const blobMs = Date.now() - blobStartedAt;

    const doc = {
      id: docId,
      name: file.name,
      type: fileType,
      size: file.size || 0,
      added: Date.now(),
      enabled: true,
      preview,
      estimatedTokens,
      content,
      hasBlob,
    };

    if (!project.documents) project.documents = [];
    project.documents.push(doc);
    project.updated = Date.now();

    const saveStartedAt = Date.now();
    await _deps.saveBlocks();
    const saveMs = Date.now() - saveStartedAt;

    console.log("[ccb-timing] addDocument", {
      fileType,
      fileSizeBytes: doc.size,
      readMs,
      blobMs,
      saveMs,
      totalMs: Date.now() - startedAt,
    });
    return doc;
  }

  async function removeDocument(projectId, docId) {
    if (!_deps) return false;

    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return false;

    const idx = (project.documents || []).findIndex(d => d.id === docId);
    if (idx === -1) return false;

    project.documents.splice(idx, 1);
    project.updated = Date.now();
    _deps.saveBlocks();

    try { await idbDelete(docId); } catch { /* blob may not exist */ }
    return true;
  }

  // Loads enabled blobs for a project and injects them into the chat's file input.
  // If no file input exists yet, queues them via ctx-meter — they will be injected
  // automatically the moment the user opens the attachment UI.
  // Returns the number of files loaded (not necessarily injected yet).
  async function injectFilesToChat(projectId) {
    const startedAt = Date.now();
    const enabledDocs = getEnabledDocuments(projectId).filter(d => d.hasBlob);
    if (!enabledDocs.length) return 0;

    let failed = 0;
    const files = [];
    for (const doc of enabledDocs) {
      try {
        const stored = await idbGet(doc.id);
        if (stored?.dataUrl) {
          const blob = dataUrlToBlob(stored.dataUrl);
          files.push(new File([blob], stored.name || doc.name, {
            type: stored.mimeType || blob.type || "application/octet-stream",
          }));
        }
      } catch (e) {
        failed++;
      }
    }
    const loadMs = Date.now() - startedAt;

    if (!files.length) {
      console.log("[ccb-timing] injectFilesToChat", { filesLoaded: 0, failed, loadMs, totalMs: Date.now() - startedAt });
      return 0;
    }

    // Try direct injection if file input is already in DOM
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      const dt = new DataTransfer();
      if (fileInput.files?.length) Array.from(fileInput.files).forEach(f => dt.items.add(f));
      files.forEach(f => dt.items.add(f));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("[ccb-timing] injectFilesToChat", { filesLoaded: files.length, failed, loadMs, mode: "direct", totalMs: Date.now() - startedAt });
      return files.length;
    }

    // File input not in DOM yet — queue via ctx-meter.
    // Files will be set automatically when the user opens the attachment UI.
    window.__ccbCtxMeter?.queueFilesForInjection?.(files);
    console.log("[ccb-timing] injectFilesToChat", { filesLoaded: files.length, failed, loadMs, mode: "queued", totalMs: Date.now() - startedAt });
    return files.length;
  }

  function toggleDocument(projectId, docId, enabled) {
    if (!_deps) return false;

    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return false;

    const doc = (project.documents || []).find(d => d.id === docId);
    if (!doc) return false;

    doc.enabled = enabled;
    project.updated = Date.now();
    _deps.saveBlocks(blocks);
    return true;
  }

  function getDocumentContent(projectId, docId) {
    if (!_deps) return null;

    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return null;

    const doc = (project.documents || []).find(d => d.id === docId);
    return doc?.content || null;
  }

  // Returns doc.content if already stored.
  // Code-project files keep their text in a separate storage key (see
  // codeContentGet above) — fetched read-only here, never written back onto
  // the doc/block, so it can't bloat future saveBlocks() calls.
  // For other docs: if content is null but a blob exists, extracts text on
  // the fly and caches it onto the doc.
  async function getOrExtractContent(projectId, docId) {
    if (!_deps) return null;

    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return null;

    const doc = (project.documents || []).find(d => d.id === docId);
    if (!doc) return null;
    if (doc.content) return doc.content;

    if (doc.type === "code") {
      try { return await codeContentGet(docId); }
      catch (e) { console.error("[document-handler] Failed to load code file content", docId, e); return null; }
    }

    if (!doc.hasBlob) return null;

    try {
      const stored = await idbGet(docId);
      if (!stored?.dataUrl) return null;
      const blob = dataUrlToBlob(stored.dataUrl);
      const file = new File([blob], stored.name || doc.name, {
        type: stored.mimeType || blob.type || "application/octet-stream",
      });
      const fileType = getFileType(file);
      let text = null;
      if (isLikelyTextFile(file)) {
        text = await file.text();
      } else if (fileType === "word") {
        text = await extractOfficeText(file, "word");
      }
      if (text) {
        doc.content = text;
        doc.preview = text.slice(0, 200).replace(/\n/g, " ");
        doc.estimatedTokens = estimateTokensForContent(text);
        project.updated = Date.now();
        _deps.saveBlocks();
      }
      return text;
    } catch (e) {
      console.error("[document-handler] getOrExtractContent failed", e);
      return null;
    }
  }

  function getEnabledDocuments(projectId) {
    if (!_deps) return [];

    const blocks = _deps.getBlocks();
    const project = blocks[projectId];
    if (!project || project.kind !== "project") return [];

    return (project.documents || []).filter(d => d.enabled);
  }

  // ============================================================
  // Code project scanning
  // ============================================================
  // Recursively walks a directory handle, skipping excluded folders entirely
  // (never descends into them) plus excluded filenames / non-listed extensions
  // / oversized files. Reads matching files immediately (no lazy loading —
  // see spec).
  //
  // `scanSettings` bundles the two layers of filtering:
  //   ignorePatterns  — this project's own exclude list (project.ignorePatterns,
  //                     edited from the documents header's ignore dialog)
  //   denyDirs / denyFilenames / codeExtensions / maxFileSizeKb
  //                   — the GLOBAL, user-editable rules that apply to every
  //                     code project (chrome.storage.local["ccb_scanSettings"],
  //                     seeded from getDefaultScanSettings()). Each falls back
  //                     to its default if the caller omits it, so a stale or
  //                     partial settings object can never silently disable a
  //                     filter (e.g. an empty codeExtensions would otherwise
  //                     mean "scan every file in the folder").
  async function scanCodeProject(dirHandle, scanSettings = {}) {
    const {
      ignorePatterns = [],
      denyDirs = DEFAULT_DENY_DIRS,
      denyFilenames = DEFAULT_DENY_FILENAMES,
      codeExtensions = DEFAULT_CODE_EXTENSIONS,
      maxFileSizeKb = DEFAULT_MAX_FILE_SIZE_KB,
      onProgress = null,
    } = scanSettings || {};

    const startedAt = Date.now();
    const included = [];
    const counts = { total: 0, included: 0, skippedDirs: 0, skippedConfig: 0, skippedExt: 0, skippedLarge: 0, skippedCustom: 0, failedRead: 0 };
    const customMatchers = buildPatternMatchers(ignorePatterns);
    const denyDirMatchers = buildPatternMatchers(denyDirs);
    const denyFileMatchers = buildPatternMatchers(denyFilenames);
    const extensions = new Set(
      codeExtensions.map((e) => String(e || "").trim().replace(/^\./, "").toLowerCase()).filter(Boolean),
    );
    const maxBytes = Math.max(1, Number(maxFileSizeKb) || DEFAULT_MAX_FILE_SIZE_KB) * 1024;

    // Phase 1 — traverse the tree and collect the file handles that pass the
    // name/extension filters. Sibling directories are walked concurrently:
    // each entries() step and each getFile() is an IPC round-trip, so a
    // strictly sequential walk over a few thousand files spends nearly all of
    // its wall time waiting rather than working.
    const discoverStartedAt = Date.now();
    const candidates = [];
    await walkDirectories(dirHandle, DIR_CONCURRENCY, async (handle, pathParts) => {
      const subdirs = [];
      for await (const [name, entry] of handle.entries()) {
        const relPath = [...pathParts, name].join("/");
        if (entry.kind === "directory") {
          if (matchesPatterns(name, relPath, denyDirMatchers) || matchesPatterns(name, relPath, customMatchers)) {
            counts.skippedDirs++;
            continue;
          }
          subdirs.push([entry, [...pathParts, name]]);
          continue;
        }

        counts.total++;
        if (matchesPatterns(name, relPath, denyFileMatchers)) { counts.skippedConfig++; continue; }
        if (matchesPatterns(name, relPath, customMatchers)) { counts.skippedCustom++; continue; }
        const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
        if (!extensions.has(ext)) { counts.skippedExt++; continue; }
        candidates.push({ entry, relPath, name });
      }
      // Reported per directory rather than per file: during discovery there's
      // no total yet, so the useful signal is "still finding things, currently
      // in this folder".
      if (onProgress) {
        onProgress({ phase: "discover", done: candidates.length, total: 0, current: pathParts.join("/") });
      }
      return subdirs;
    });
    const discoverMs = Date.now() - discoverStartedAt;

    // Phase 2 — read the surviving files, again with a bounded number of
    // reads in flight. The cap keeps memory and the browser's file-IO queue
    // from being flooded on very large projects.
    // `completed` counts attempts, not successes, so the bar still reaches its
    // total when some files are skipped as oversized or fail to read.
    //
    // Progress is reported both when a file STARTS (so `current` names what is
    // being read right now) and when it FINISHES (so `done` counts completions).
    // Reporting only at the start would make the count stall short of the
    // total by however many reads are in flight — with a cap of 12, the bar
    // would freeze near the end of every scan.
    const readStartedAt = Date.now();
    let completed = 0;
    await runWithConcurrency(candidates, FILE_READ_CONCURRENCY, async ({ entry, relPath }) => {
      try {
        if (onProgress) {
          onProgress({ phase: "read", done: completed, total: candidates.length, current: relPath });
        }
        const file = await entry.getFile();
        if (file.size > maxBytes) { counts.skippedLarge++; return; }
        const content = await file.text();
        included.push({
          relativePath: relPath,
          content,
          size: file.size,
          tokens: estimateTokensForContent(content),
        });
        counts.included++;
      } catch (e) {
        // No filename/path here on purpose — console logs must never carry
        // project content or structure, only counts and timings.
        counts.failedRead++;
      } finally {
        completed++;
        if (onProgress) {
          onProgress({ phase: "read", done: completed, total: candidates.length, current: relPath });
        }
      }
    });
    const readMs = Date.now() - readStartedAt;

    // Concurrent reads finish out of order — sort so the structure doc, the
    // file tree, and the dep graph are stable across scans of the same folder.
    included.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    // Timing/operation logs only — never file names, paths, or file content,
    // so a scan of a private project can't leak what's in it via the console.
    console.log("[ccb-timing] scanCodeProject", {
      filesFound: counts.total,
      filesIncluded: counts.included,
      skippedDirs: counts.skippedDirs,
      skippedConfig: counts.skippedConfig,
      skippedExt: counts.skippedExt,
      skippedLarge: counts.skippedLarge,
      skippedCustom: counts.skippedCustom,
      failedRead: counts.failedRead,
      discoverMs,
      readMs,
      totalMs: Date.now() - startedAt,
    });
    return { included, counts };
  }

  // Builds a nested { name: { childName: {...} } } tree from flat relative paths.
  // A leaf (no children) is a file; any node with children is a directory —
  // safe because this tree is only ever built from file paths (no empty dirs).
  function buildPathTree(paths) {
    const root = {};
    for (const p of paths) {
      let node = root;
      for (const part of p.split("/")) {
        node[part] = node[part] || {};
        node = node[part];
      }
    }
    return root;
  }

  function renderPathTree(node, prefix = "") {
    const names = Object.keys(node).sort((a, b) => {
      const aIsDir = Object.keys(node[a]).length > 0;
      const bIsDir = Object.keys(node[b]).length > 0;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });

    let lines = [];
    names.forEach((name, idx) => {
      const isLast = idx === names.length - 1;
      lines.push(prefix + (isLast ? "└── " : "├── ") + name);
      lines = lines.concat(renderPathTree(node[name], prefix + (isLast ? "    " : "│   ")));
    });
    return lines;
  }

  function buildStructureMarkdown(included, rootName) {
    const tree = buildPathTree(included.map((f) => f.relativePath).sort());
    const lines = renderPathTree(tree);
    return `# מבנה הפרויקט: ${rootName}\n\n\`\`\`\n${rootName}/\n${lines.join("\n")}\n\`\`\`\n`;
  }

  // Upserts the structure doc + one doc per scanned file into project.documents,
  // preserving `enabled` on files that already existed, and dropping documents
  // for files that disappeared from disk since the last scan.
  async function syncCodeProjectDocuments(project, included, rootName, onProgress = null) {
    if (!_deps) return;
    const startedAt = Date.now();
    if (!project.documents) project.documents = [];

    const structureId = `structure_${project.id}`;
    const structureMd = buildStructureMarkdown(included, rootName);
    let structureDoc = project.documents.find((d) => d.id === structureId);
    if (structureDoc) {
      structureDoc.content = structureMd;
      structureDoc.estimatedTokens = estimateTokensForContent(structureMd);
    } else {
      structureDoc = {
        id: structureId,
        type: "structure",
        name: "PROJECT_STRUCTURE.md",
        content: structureMd,
        estimatedTokens: estimateTokensForContent(structureMd),
        size: structureMd.length,
        preview: "",
        added: Date.now(),
        enabled: true,
        hasBlob: false,
      };
      project.documents.unshift(structureDoc);
    }

    const existingByPath = new Map(
      project.documents.filter((d) => d.type === "code").map((d) => [d.name, d]),
    );

    // File text is written to its own storage key, never inline on the doc —
    // that's what keeps saveBlocks() cheap regardless of how many files/how
    // large the project is. Writes are collected here and flushed in batches
    // below: chrome.storage.local.set accepts many keys per call, so one call
    // per file would pay the IPC round-trip thousands of times over.
    const pendingContent = {};
    for (const file of included) {
      let doc = existingByPath.get(file.relativePath);
      if (doc) {
        doc.estimatedTokens = file.tokens;
        doc.size = file.size;
        doc.preview = file.content.slice(0, 200).replace(/\n/g, " ");
        // Migrate docs scanned before content moved out of `blocks` —
        // otherwise the stale inline text keeps bloating every future save.
        if (doc.content) delete doc.content;
      } else {
        doc = {
          id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "code",
          name: file.relativePath,
          estimatedTokens: file.tokens,
          size: file.size,
          preview: file.content.slice(0, 200).replace(/\n/g, " "),
          added: Date.now(),
          enabled: true,
          hasBlob: false,
        };
        project.documents.push(doc);
      }
      pendingContent[codeContentKey(doc.id)] = file.content;
    }

    const includedPaths = new Set(included.map((f) => f.relativePath));
    const removedDocs = project.documents.filter(
      (d) => d.type === "code" && !includedPaths.has(d.name),
    );
    project.documents = project.documents.filter(
      (d) => d.id === structureId || d.type !== "code" || includedPaths.has(d.name),
    );

    const writeStartedAt = Date.now();
    await codeContentPutMany(pendingContent, onProgress);
    if (removedDocs.length) {
      await codeContentRemoveMany(removedDocs.map((d) => d.id));
    }
    const writeMs = Date.now() - writeStartedAt;

    project.lastScanned = Date.now();
    project.updated = Date.now();
    const saveStartedAt = Date.now();
    await _deps.saveBlocks();
    const saveMs = Date.now() - saveStartedAt;

    console.log("[ccb-timing] syncCodeProjectDocuments", {
      filesWritten: Object.keys(pendingContent).length,
      filesRemoved: removedDocs.length,
      writeMs,
      saveMs,
      totalMs: Date.now() - startedAt,
    });
  }

  // ============================================================
  // Public API
  // ============================================================
  window.__ccbDocHandler = {
    init(deps) {
      _deps = deps;
    },
    addDocument,
    removeDocument,
    toggleDocument,
    getDocumentContent,
    getOrExtractContent,
    getCodeContents: codeContentGetMany,
    getEnabledDocuments,
    injectFilesToChat,
    estimateTokens: estimateTokensForContent,
    estimateFileTokens: estimateTokensForFile,
    getFileType,
    isLikelyTextFile,
    scanCodeProject,
    getDefaultScanSettings,
    buildStructureMarkdown,
    syncCodeProjectDocuments,
    removeCodeContent: codeContentRemove,
  };
})();
