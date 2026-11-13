// ─────────────────────────────
// Web Locks の入口。ブラウザのタブをまたいで同じ物を 2 か所で持たないための鍵を取る・見る。
// Web Locks に触れない環境では、取れたものとして扱う（一覧は取れないので null）。
// ─────────────────────────────

/** 鍵の管理。無い環境では undefined */
function lockManager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

/** Web Locks を使える環境か */
export function hasWebLocks(): boolean {
  return lockManager() !== undefined;
}

/** 名前の鍵を取り、タブを閉じるまで持つ。ほかのタブが持っていれば false */
export function hold(name: string): Promise<boolean> {
  const locks = lockManager();
  if (locks === undefined) return Promise.resolve(true);

  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // 返した約束が終わるまで鍵を持つ。終わらせない（タブを閉じると放される）
        return lock === null ? undefined : new Promise<never>(() => undefined);
      })
      .catch(() => resolve(true));
  });
}

/**
 * 名前の鍵を取り、放す手続きを返す。ほかのタブが持っていれば null。
 * Web Locks に触れない環境・頼めなかったときは、何もしない手続きを返す
 */
export function holdReleasable(name: string): Promise<(() => void) | null> {
  const locks = lockManager();
  if (locks === undefined) return Promise.resolve(() => undefined);

  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(null);
          return undefined;
        }
        // 放すまで返さない約束で鍵を持ち続ける
        return new Promise<void>((release) => resolve(release));
      })
      .catch(() => resolve(() => undefined));
  });
}

/** どのタブかが持っている鍵の名前。Web Locks に触れない環境では null。一覧の失敗は投げる */
export async function heldLockNames(): Promise<Set<string> | null> {
  const locks = lockManager();
  if (locks === undefined) return null;
  return new Set(((await locks.query()).held ?? []).map((lock) => lock.name ?? ''));
}
