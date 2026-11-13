// ─────────────────────────────
// 作り直した表示データが前回と同じ中身なら、前回の参照を返す。受け取る側は参照だけ比べれば
// 「変わったか」が分かり、変わらないものの描き直しを省ける。
// ─────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 配列と素のオブジェクトは中身で、それ以外は参照（`Object.is`）で比べる */
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

/**
 * `next` の各要素について、`previous` に同じ鍵で同じ中身のものがあれば前回の参照に差し替える。
 * 並び・件数は `next` のまま。前回が無ければ `next` をそのまま返す
 */
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

/** Map の中身を比べる。鍵ごとの値は `sameContent` で比べる */
export function sameEntries<K, V>(a: ReadonlyMap<K, V>, b: ReadonlyMap<K, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key) || !sameContent(value, b.get(key))) return false;
  }
  return true;
}
