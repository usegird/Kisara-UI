export function stablePartition<T>(items: readonly T[], first: (item: T) => boolean): readonly T[] {
  const front = items.filter(first);
  const back = items.filter((item) => !first(item));
  const sorted = [...front, ...back];
  return sorted.every((item, index) => item === items[index]) ? items : sorted;
}
