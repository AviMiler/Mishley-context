// fs-handles.js — IndexedDB storage for FileSystemDirectoryHandle objects.
// chrome.storage.local can't hold Handles (JSON-only); IndexedDB supports
// structured clone, so real directory handles live here instead.
// Exposes: window.__ccbFsHandles
//
// Public API:
//   put(id, dirHandle) — store a handle
//   get(id)            — retrieve a handle (or null)
//   remove(id)          — delete a handle
//   verifyPermission(dirHandle, mode?) — ensure read/readwrite permission, prompting if needed

(() => {
  if (window.__ccbFsHandlesInstalled) return;
  window.__ccbFsHandlesInstalled = true;

  const DB_NAME = "ccbFsHandles";
  const DB_VERSION = 1;
  const STORE_NAME = "handles";

  let _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  // Timing/operation logs only — never the handle's folder name.
  async function put(id, dirHandle) {
    const startedAt = Date.now();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(dirHandle, id);
      tx.oncomplete = () => { console.log("[ccb-timing] fs-handles.put", { ms: Date.now() - startedAt }); resolve(); };
      tx.onerror = () => { console.error("[fs-handles] put failed", tx.error); reject(tx.error); };
    });
  }

  async function get(id) {
    const startedAt = Date.now();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { console.log("[ccb-timing] fs-handles.get", { found: !!req.result, ms: Date.now() - startedAt }); resolve(req.result || null); };
      req.onerror = () => { console.error("[fs-handles] get failed", req.error); reject(req.error); };
    });
  }

  async function remove(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Must be called from a user-gesture handler — requestPermission() requires one.
  // Timing/operation logs only — never the handle's folder name.
  async function verifyPermission(dirHandle, mode = "read") {
    const startedAt = Date.now();
    if (!dirHandle) return false;
    const opts = { mode };
    try {
      const queryResult = await dirHandle.queryPermission(opts);
      if (queryResult === "granted") {
        console.log("[ccb-timing] fs-handles.verifyPermission", { result: "granted", prompted: false, ms: Date.now() - startedAt });
        return true;
      }
      const requestResult = await dirHandle.requestPermission(opts);
      console.log("[ccb-timing] fs-handles.verifyPermission", { result: requestResult, prompted: true, ms: Date.now() - startedAt });
      return requestResult === "granted";
    } catch (e) {
      console.error("[fs-handles] verifyPermission failed", e);
      return false;
    }
  }

  window.__ccbFsHandles = { put, get, remove, verifyPermission };
})();
