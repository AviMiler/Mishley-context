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

  async function put(id, dirHandle) {
    console.log("[ccb-scan][fs-handles] put: opening DB", { id, handleName: dirHandle && dirHandle.name });
    const db = await openDb();
    console.log("[ccb-scan][fs-handles] put: DB open, starting transaction", { id });
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(dirHandle, id);
      tx.oncomplete = () => { console.log("[ccb-scan][fs-handles] put: tx complete", { id }); resolve(); };
      tx.onerror = () => { console.error("[ccb-scan][fs-handles] put: tx error", { id }, tx.error); reject(tx.error); };
    });
  }

  async function get(id) {
    console.log("[ccb-scan][fs-handles] get: opening DB", { id });
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { console.log("[ccb-scan][fs-handles] get: success", { id, found: !!req.result }); resolve(req.result || null); };
      req.onerror = () => { console.error("[ccb-scan][fs-handles] get: error", { id }, req.error); reject(req.error); };
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
  async function verifyPermission(dirHandle, mode = "read") {
    console.log("[ccb-scan][fs-handles] verifyPermission: start", { handleName: dirHandle && dirHandle.name, mode });
    if (!dirHandle) { console.warn("[ccb-scan][fs-handles] verifyPermission: no handle"); return false; }
    const opts = { mode };
    try {
      const queryResult = await dirHandle.queryPermission(opts);
      console.log("[ccb-scan][fs-handles] verifyPermission: queryPermission result", queryResult);
      if (queryResult === "granted") return true;
      const requestResult = await dirHandle.requestPermission(opts);
      console.log("[ccb-scan][fs-handles] verifyPermission: requestPermission result", requestResult);
      if (requestResult === "granted") return true;
      return false;
    } catch (e) {
      console.error("[fs-handles] verifyPermission failed", e);
      return false;
    }
  }

  window.__ccbFsHandles = { put, get, remove, verifyPermission };
})();
