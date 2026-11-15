// Minimal IndexedDB key-value store in the browser's private origin storage. Used for the working
// copy fallback and to remember the linked project file handle.

const DB = "fire";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB aborted"));
    });
  } finally {
    db.close();
  }
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await run("readwrite", (s) => s.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}
