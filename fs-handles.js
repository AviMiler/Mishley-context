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
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(dirHandle, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
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
    if (!dirHandle) return false;
    const opts = { mode };
    try {
      if ((await dirHandle.queryPermission(opts)) === "granted") return true;
      if ((await dirHandle.requestPermission(opts)) === "granted") return true;
      return false;
    } catch (e) {
      console.error("[fs-handles] verifyPermission failed", e);
      return false;
    }
  }

  window.__ccbFsHandles = { put, get, remove, verifyPermission };
})();
