import type { StateStorage } from 'zustand/middleware';

const fallbacks = { local: new Map<string, string>(), session: new Map<string, string>() };

let failureListener: ((area: 'local' | 'session') => void) | null = null;

export function onStorageWriteFailure(listener: (area: 'local' | 'session') => void): void {
  failureListener = listener;
}

export function safeStorage(area: 'local' | 'session' = 'local'): StateStorage {
  const memory = fallbacks[area];
  try {
    const found = area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    if (typeof found !== 'undefined') {
      const storage = found;

      return {
        getItem: (name) => memory.get(name) ?? storage.getItem(name),
        setItem: (name, value) => {
          try {
            storage.setItem(name, value);
            memory.delete(name);
          } catch {
            memory.set(name, value);
            failureListener?.(area);
          }
        },
        removeItem: (name) => {
          memory.delete(name);
          storage.removeItem(name);
        },
      };
    }
  } catch {
  }
  return {
    getItem: (name) => memory.get(name) ?? null,
    setItem: (name, value) => {
      memory.set(name, value);
      failureListener?.(area);
    },
    removeItem: (name) => void memory.delete(name),
  };
}
