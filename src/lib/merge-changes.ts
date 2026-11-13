import { isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// 2 つのブラウザのタブが同じ値を書くとき、このタブで変わった所だけを置き場の値に重ねる。
// 古い状態のタブが書いても、ほかのタブの変更を消さない。
// ─────────────────────────────

// 変わったかは JSON の文字で比べる（保存領域に書く値はどれも JSON にできる）
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 1 段目の項目ごとに重ねる。`previous` はこのタブが前に読んだ・書いた値、`next` はこれから書く値、
 * `stored` は今の置き場の値。`next` で `previous` から変わった項目と、`previous` から消えた項目だけを
 * `stored` に当てる。置き場が読めなければ `next` をそのまま使う
 */
export function mergeChangedKeys(
  stored: unknown,
  previous: unknown,
  next: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (!isRecord(stored)) return { ...next };
  const before = isRecord(previous) ? previous : {};
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(next)) {
    if (!Object.hasOwn(before, key) || !same(before[key], value)) setOwn(merged, key, value);
  }
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(next, key)) delete merged[key];
  }
  return merged;
}

/**
 * 1 件ずつ（`id` ごと）に重ねる。このタブで足した・直した 1 件は `next` の内容に、消した 1 件は
 * 置き場からも外す。ほかは置き場のまま。並びは置き場の順で、足した 1 件は後ろに付ける
 */
export function mergeChangedItems<T extends { readonly id: string }>(
  stored: unknown,
  previous: readonly T[],
  next: readonly T[],
): unknown[] {
  if (!isUnknownArray(stored)) return [...next];
  const before = new Map(previous.map((item) => [item.id, item]));
  const after = new Map(next.map((item) => [item.id, item]));
  const changed = new Set(
    next.filter((item) => !same(before.get(item.id), item)).map((item) => item.id),
  );
  const removed = new Set(previous.filter((item) => !after.has(item.id)).map((item) => item.id));

  const merged: unknown[] = [];
  const placed = new Set<string>();
  for (const item of stored) {
    const id = isRecord(item) && typeof item.id === 'string' ? item.id : null;
    if (id !== null && removed.has(id)) continue;
    if (id !== null && changed.has(id)) {
      merged.push(after.get(id));
      placed.add(id);
      continue;
    }
    if (id !== null) placed.add(id);
    merged.push(item);
  }
  for (const id of changed) if (!placed.has(id)) merged.push(after.get(id));
  return merged;
}
