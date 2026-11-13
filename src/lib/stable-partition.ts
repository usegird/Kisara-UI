// ─────────────────────────────
// 並びを 2 つに分け、条件に合うものを前に寄せる（それぞれの中の順は保つ）。
// 既に寄っていれば同じ配列を返す（呼び出し側が書き直さずに済む）。
// ─────────────────────────────

/** 条件に合うものを前に寄せた並びを返す */
export function stablePartition<T>(items: readonly T[], first: (item: T) => boolean): readonly T[] {
  const front = items.filter(first);
  const back = items.filter((item) => !first(item));
  const sorted = [...front, ...back];
  return sorted.every((item, index) => item === items[index]) ? items : sorted;
}
