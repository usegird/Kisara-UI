type Grant = (lock: { readonly name: string } | null) => unknown;

interface Waiting {
  readonly name: string;
  readonly run: () => void;
}

function createLockManager(): Pick<LockManager, 'request' | 'query'> {
  const held = new Set<string>();
  const waiting: Waiting[] = [];

  const release = (name: string): void => {
    held.delete(name);
    const next = waiting.findIndex((item) => item.name === name);
    if (next >= 0) waiting.splice(next, 1)[0]?.run();
  };

  const grant = (name: string, callback: Grant): Promise<unknown> => {
    held.add(name);
    return Promise.resolve()
      .then(() => callback({ name }))
      .finally(() => release(name));
  };

  const request = (
    name: string,
    optionsOrCallback: LockOptions | Grant,
    maybeCallback?: Grant,
  ): Promise<unknown> => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (callback === undefined) return Promise.reject(new TypeError('callback is required'));
    if (!held.has(name)) return grant(name, callback);
    if (options.ifAvailable === true) return Promise.resolve().then(() => callback(null));
    return new Promise((resolve, reject) => {
      waiting.push({ name, run: () => void grant(name, callback).then(resolve, reject) });
    });
  };

  const query = (): Promise<LockManagerSnapshot> =>
    Promise.resolve({
      held: [...held].map((name) => ({ name, mode: 'exclusive' as const, clientId: '' })),
      pending: waiting.map(({ name }) => ({ name, mode: 'exclusive' as const, clientId: '' })),
    });

  return { request: request as LockManager['request'], query };
}

if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createLockManager(),
  });
}
