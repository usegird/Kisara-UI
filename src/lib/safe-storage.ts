import type { StateStorage } from 'zustand/middleware';

// ─────────────────────────────
// localStorage・sessionStorage の入口。**無い環境・触ると例外になる設定**（プライベートウィンドウ、
// サイトデータをブロックする設定、テスト）でも落ちないようにする。
// ─────────────────────────────

/** 保存領域ごとの、書けなかった値の写し（どの入口から読んでも同じ物を見る） */
const fallbacks = { local: new Map<string, string>(), session: new Map<string, string>() };

let failureListener: ((area: 'local' | 'session') => void) | null = null;

/** 保存領域に書けなかったときに呼ぶ手続きを決める（1 つだけ） */
export function onStorageWriteFailure(listener: (area: 'local' | 'session') => void): void {
  failureListener = listener;
}

/**
 * 落ちない保存領域の入口を作る。書けなかった値（容量超過など）はページを開いている間だけ
 * メモリに持ち、読むときもそちらを先に見る。書けなかったことは `onStorageWriteFailure` で
 * 受けた側に伝える
 */
export function safeStorage(area: 'local' | 'session' = 'local'): StateStorage {
  const memory = fallbacks[area];
  try {
    const found = area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    if (typeof found !== 'undefined') {
      const storage = found;

      return {
        getItem: (name) => memory.get(name) ?? storage.getItem(name),
        // 容量超過（QuotaExceededError）で画面を落とさない
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
    // アクセス自体が例外になるブラウザ設定がある
  }
  // 保存領域に触れない環境でも、書いた値は読み込み直すと消えるので伝える
  return {
    getItem: (name) => memory.get(name) ?? null,
    setItem: (name, value) => {
      memory.set(name, value);
      failureListener?.(area);
    },
    removeItem: (name) => void memory.delete(name),
  };
}
