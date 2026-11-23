import { isRecord, isUnknownArray } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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
