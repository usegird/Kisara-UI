function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameContent(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => Object.hasOwn(b, key) && sameContent(a[key], b[key]));
  }

  return false;
}

export function reuseEqualItems<T, K>(
  previous: readonly T[] | undefined,
  next: readonly T[],
  keyOf: (item: T) => K,
): readonly T[] {
  if (previous === undefined || previous.length === 0) return next;

  const byKey = new Map<K, T>();
  for (const item of previous) byKey.set(keyOf(item), item);

  return next.map((item) => {
    const before = byKey.get(keyOf(item));
    return before !== undefined && sameContent(before, item) ? before : item;
  });
}

export function sameEntries<K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key) || !sameContent(value, b.get(key))) return false;
  }
  return true;
}
