import { withAppStore } from '@/store/persist/app-db';

export interface SessionStore {
  readonly get: (key: string) => Promise<unknown>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly keys: () => Promise<string[]>;
}

function createIndexedDbSessionStore(factory: IDBFactory): SessionStore {
  return {
    get: (key) => withAppStore(factory, 'session', 'readonly', (store) => store.get(key)),
    put: async (key, value) => {
      await withAppStore(factory, 'session', 'readwrite', (store) => store.put(value, key));
    },
    delete: async (key) => {
      await withAppStore(factory, 'session', 'readwrite', (store) => store.delete(key));
    },
    keys: async () => {
      const keys = await withAppStore(factory, 'session', 'readonly', (store) =>
        store.getAllKeys(),
      );
      return keys.filter((key): key is string => typeof key === 'string');
    },
  };
}

export function createMemorySessionStore(): SessionStore & {
  readonly entries: () => ReadonlyMap<string, unknown>;
} {
  const saved = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(saved.has(key) ? structuredClone(saved.get(key)) : undefined),
    put: (key, value) => {
      saved.set(key, structuredClone(value));
      return Promise.resolve();
    },
    delete: (key) => {
      saved.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...saved.keys()]),
    entries: () => saved,
  };
}

let sharedStore: SessionStore | null = null;

export function defaultSessionStore(): SessionStore {
  if (sharedStore !== null) return sharedStore;
  try {
    if (typeof globalThis.indexedDB !== 'undefined') {
      sharedStore = createIndexedDbSessionStore(globalThis.indexedDB);
      return sharedStore;
    }
  } catch {
  }
  sharedStore = createMemorySessionStore();
  return sharedStore;
}

export async function getOrNull(store: SessionStore, key: string): Promise<unknown> {
  try {
    return (await store.get(key)) ?? null;
  } catch {
    return null;
  }
}
