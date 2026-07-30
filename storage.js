// storage.js — chrome.storage.local helpers. Loaded before content.js.
//
// ============================================================
// Storage layout (v2)
// ============================================================
//   blocks             — the block map. METADATA ONLY, never bulk data.
//   conv_<id>          — one conversation's messages[]        (A1)
//   depGraph_<id>      — one code project's scanned import graph (A2)
//   codeContent_<id>   — one code file's text     (pre-existing, document-handler.js)
//   docBlob_<id>       — one uploaded doc's blob  (pre-existing, document-handler.js)
//
// WHY this split exists: chrome.storage.local.set({ blocks }) re-serializes
// and rewrites the ENTIRE map on every call, and there are ~30 saveBlocks()
// call sites — including the 2.5s conversation auto-save tick and every file
// checkbox in the code tree. With messages[] and depGraph stored inline on
// their blocks that meant rewriting ~138MB per keystroke-scale action, which
// is what froze the panel. Bulk data therefore gets its own key and is
// written only when that specific data actually changes.
//
// This is the same reasoning that already put codeContent_<id>/docBlob_<id>
// outside `blocks` — A1/A2 just finish the job for the two remaining
// offenders. See ARCHITECTURE.md "Storage shape".
window.__ccbStorage = (() => {
  // chrome.storage.local.set accepts many keys per call and each call is an
  // IPC round-trip, so bulk writes are chunked rather than sent one-by-one.
  // 50 matches the batch size document-handler.js already uses for scans.
  const WRITE_BATCH = 50;

  function convKey(id) {
    return `conv_${id}`;
  }

  function depGraphKey(projectId) {
    return `depGraph_${projectId}`;
  }

  function get(keys) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result || {});
      }),
    );
  }

  function set(items) {
    return new Promise((resolve, reject) =>
      chrome.storage.local.set(items, () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
      ),
    );
  }

  function remove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) return Promise.resolve();
    return new Promise((resolve, reject) =>
      chrome.storage.local.remove(list, () =>
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(),
      ),
    );
  }

  // Write many keys in bounded batches. Used by the v2 migration and by any
  // path that persists a lot of conversations/graphs at once.
  async function setBatched(items) {
    const entries = Object.entries(items || {});
    for (let i = 0; i < entries.length; i += WRITE_BATCH) {
      await set(Object.fromEntries(entries.slice(i, i + WRITE_BATCH)));
    }
  }

  // ============================================================
  // blocks (metadata map)
  // ============================================================
  async function loadBlocks(storageKey) {
    try {
      const data = await get(storageKey);
      return data[storageKey] || {};
    } catch {
      return {};
    }
  }

  async function saveBlocks(storageKey, blocks) {
    try {
      await set({ [storageKey]: blocks });
    } catch {}
  }

  // ============================================================
  // conv_<id> — conversation messages
  // ============================================================
  async function loadConvMessages(id) {
    try {
      const data = await get([convKey(id)]);
      const messages = data[convKey(id)];
      return Array.isArray(messages) ? messages : null;
    } catch {
      return null;
    }
  }

  // Batched sibling of loadConvMessages — one round-trip for many
  // conversations instead of one per conversation. This is what makes the
  // async History content-search affordable: it reads the conversations in
  // scope in chunks rather than 3,000+ sequential gets.
  // Returns Map<id, messages[]>; ids with nothing stored are absent.
  async function loadConvMessagesBatch(ids) {
    const list = Array.from(new Set(ids || []));
    const out = new Map();
    if (!list.length) return out;
    for (let i = 0; i < list.length; i += WRITE_BATCH) {
      const chunk = list.slice(i, i + WRITE_BATCH);
      try {
        const data = await get(chunk.map(convKey));
        for (const id of chunk) {
          const messages = data[convKey(id)];
          if (Array.isArray(messages)) out.set(id, messages);
        }
      } catch {}
    }
    return out;
  }

  async function saveConvMessages(id, messages) {
    try {
      await set({ [convKey(id)]: messages });
      return true;
    } catch {
      return false;
    }
  }

  async function removeConvMessages(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    try {
      await remove(list.map(convKey));
    } catch {}
  }

  // ============================================================
  // depGraph_<projectId> — scanned import graph
  // ============================================================
  async function loadDepGraph(projectId) {
    try {
      const data = await get([depGraphKey(projectId)]);
      const graph = data[depGraphKey(projectId)];
      return graph && typeof graph === "object" ? graph : null;
    } catch {
      return null;
    }
  }

  async function saveDepGraph(projectId, graph) {
    try {
      await set({ [depGraphKey(projectId)]: graph });
      return true;
    } catch {
      return false;
    }
  }

  async function removeDepGraph(projectId) {
    try {
      await remove([depGraphKey(projectId)]);
    } catch {}
  }

  return {
    loadBlocks,
    saveBlocks,
    convKey,
    depGraphKey,
    loadConvMessages,
    loadConvMessagesBatch,
    saveConvMessages,
    removeConvMessages,
    loadDepGraph,
    saveDepGraph,
    removeDepGraph,
    setBatched,
    remove,
    get,
  };
})();
