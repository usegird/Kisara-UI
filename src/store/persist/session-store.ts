import { withAppStore } from '@/store/persist/app-db';

// ─────────────────────────────
// 開いていたものの控えの置き場。読み書きは待ちが要る。鍵ごとの 1 件を出し入れする。
// ─────────────────────────────

/** 控えの置き場の読み書き（テストでは作り物に差し替える） */
export interface SessionStore {
  readonly get: (key: string) => Promise<unknown>;
  readonly put: (key: string, value: unknown) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly keys: () => Promise<string[]>;
}

/**
 * 大きい保存領域（IndexedDB）に置く控えを作る。大きさの読めないワークフローを設定と同じ
 * 小さい領域（localStorage）に置くと、容量を奪い合って設定まで書けなくなる
 */
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

/** IndexedDB が使えない環境（プライベートウィンドウ等）とテスト向け。画面を閉じると消える */
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

/** 読み戻しと書き込みで**同じ置き場**を使う（メモリに落ちたときに別々にならないよう） */
export function defaultSessionStore(): SessionStore {
  if (sharedStore !== null) return sharedStore;
  try {
    if (typeof globalThis.indexedDB !== 'undefined') {
      sharedStore = createIndexedDbSessionStore(globalThis.indexedDB);
      return sharedStore;
    }
  } catch {
    // IndexedDB へのアクセス自体が例外になる環境がある
  }
  sharedStore = createMemorySessionStore();
  return sharedStore;
}

/** 1 件読む。読めなければ null */
export async function getOrNull(store: SessionStore, key: string): Promise<unknown> {
  try {
    return (await store.get(key)) ?? null;
  } catch {
    return null;
  }
}
