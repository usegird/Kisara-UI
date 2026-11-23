const DB_NAME = 'kisaraui';

export const WRITE_DELAY_MS = 800;
const DB_VERSION = 9;

export type AppStoreName =
  | 'object-info'
  | 'session'
  | 'chat'
  | 'chat-meta'
  | 'preset'
  | 'system-prompt'
  | 'dictionary'
  | 'avatar'
  | 'playbook';

const STORES: Readonly<Record<AppStoreName, string | null>> = {
  'object-info': 'baseUrl',
  session: null,
  chat: null,
  'chat-meta': null,
  preset: null,
  'system-prompt': null,
  dictionary: null,
  avatar: null,
  playbook: null,
};

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function openAppDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        if (keyPath === null) db.createObjectStore(name);
        else db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another page'));
  });
}

export async function withAppStore<T>(
  factory: IDBFactory,
  name: AppStoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openAppDb(factory);
  try {
    return await promisify(run(db.transaction(name, mode).objectStore(name)));
  } finally {
    db.close();
  }
}
