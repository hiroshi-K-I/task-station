class TaskDB {
  constructor() {
    this.db = null;
  }

  async init() {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('TaskStationDB', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('boards')) {
          db.createObjectStore('boards', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('columns')) {
          const s = db.createObjectStore('columns', { keyPath: 'id' });
          s.createIndex('boardId', 'boardId');
        }
        if (!db.objectStoreNames.contains('tasks')) {
          const s = db.createObjectStore('tasks', { keyPath: 'id' });
          s.createIndex('columnId', 'columnId');
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async getAll(store) {
    return new Promise((resolve, reject) => {
      const req = this.db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(store, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(store, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async putMany(store, items) {
    if (!items || !items.length) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const obj = tx.objectStore(store);
      items.forEach(item => obj.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
