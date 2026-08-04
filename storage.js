// storage.js — chrome.storage.local helpers. Loaded before content.js.
//
// ============================================================
// Storage layout (v3)
// ============================================================
//   blocks             — the block map. METADATA ONLY, never bulk data.
//   depGraph_<id>      — one code project's scanned import graph (A2)
//   codeContent_<id>   — one code file's text     (pre-existing, document-handler.js)
//   docBlob_<id>       — one uploaded doc's blob  (pre-existing, document-handler.js)
//
// WHY this split exists: chrome.storage.local.set({ blocks }) re-serializes
// and rewrites the ENTIRE map on every call, and there are ~30 saveBlocks()
// call sites — including every file checkbox in the code tree. With depGraph
// stored inline on its block that meant rewriting the whole map per
// keystroke-scale action, which is what froze the panel. Bulk data therefore
// gets its own key and is written only when that specific data actually
// changes.
//
// This is the same reasoning that already put codeContent_<id>/docBlob_<id>
// outside `blocks` — A2 just finishes the job. See ARCHITECTURE.md
// "Storage shape".
//
// v3 (2026-08-04) retired the conversation-history feature entirely, taking
// the `conv_<id>` key with it — purgeConversationData() below is the one-time
// cleanup that reclaims it, and is the ONLY conversation-aware code left.
window.__ccbStorage = (() => {
  // chrome.storage.local.set accepts many keys per call and each call is an
  // IPC round-trip, so bulk writes are chunked rather than sent one-by-one.
  // 50 matches the batch size document-handler.js already uses for scans.
  const WRITE_BATCH = 50;

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

  // Write many keys in bounded batches. Used by the storage migration and by
  // any path that persists a lot of graphs at once.
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
  // conv_<id> — one-time cleanup only (feature removed 2026-08-04)
  // ============================================================
  // The conversation-history feature is gone, so nothing reads these keys
  // anymore. This deletes them for good rather than leaving the data (which
  // reached ~138MB on one real profile) stranded in storage forever.
  //
  // `ids` covers the conversations still listed in `blocks`. Orphans — keys
  // whose block was deleted at some point without its messages — are swept
  // too when chrome.storage.local.getKeys() is available (Chrome 130+); it
  // returns just the key names, so unlike get(null) it doesn't pull every
  // stored byte into memory to find them. Where it isn't available the
  // block-derived list is the best we can do, which is the same coverage the
  // feature's own delete path had.
  async function purgeConversationData(ids) {
    const keys = new Set(
      (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map((id) => `conv_${id}`),
    );
    try {
      const all = await chrome.storage.local.getKeys?.();
      for (const k of all || []) {
        if (k.startsWith("conv_")) keys.add(k);
      }
    } catch {}
    const list = Array.from(keys);
    for (let i = 0; i < list.length; i += WRITE_BATCH) {
      try {
        await remove(list.slice(i, i + WRITE_BATCH));
      } catch {}
    }
    return list.length;
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
    depGraphKey,
    purgeConversationData,
    loadDepGraph,
    saveDepGraph,
    removeDepGraph,
    setBatched,
    remove,
    get,
  };
})();
