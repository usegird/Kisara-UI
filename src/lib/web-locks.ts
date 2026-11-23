function lockManager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

export function hasWebLocks(): boolean {
  return lockManager() !== undefined;
}

export function hold(name: string): Promise<boolean> {
  const locks = lockManager();
  if (locks === undefined) return Promise.resolve(true);

  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        return lock === null ? undefined : new Promise<never>(() => undefined);
      })
      .catch(() => resolve(true));
  });
}

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
        return new Promise<void>((release) => resolve(release));
      })
      .catch(() => resolve(() => undefined));
  });
}

export async function heldLockNames(): Promise<Set<string> | null> {
  const locks = lockManager();
  if (locks === undefined) return null;
  return new Set(((await locks.query()).held ?? []).map((lock) => lock.name ?? ''));
}
