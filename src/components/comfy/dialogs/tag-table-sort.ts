import { tagKey } from '@/graph/tag-dictionary';

export type TagSortKey = 'tag' | 'aliases' | 'priority';

export interface TagSort {
  readonly key: TagSortKey;
  readonly ascending: boolean;
}

export interface TagSortFields {
  readonly tag: string;
  readonly aliases: string;
  readonly priority: number;
}

export function nextTagSort(current: TagSort | null, key: TagSortKey): TagSort | null {
  if (current?.key !== key) return { key, ascending: true };
  return current.ascending ? { key, ascending: false } : null;
}

export function sortTagRows<T>(
  rows: readonly T[],
  sort: TagSort | null,
  fieldsOf: (row: T) => TagSortFields,
): T[] {
  if (sort === null) return [...rows];
  const direction = sort.ascending ? 1 : -1;
  const keyed = rows.map((row) => ({ row, fields: fieldsOf(row) }));
  keyed.sort((a, b) => {
    if (sort.key === 'priority') return direction * (a.fields.priority - b.fields.priority);
    if (sort.key === 'tag') return direction * compareText(a.fields.tag, b.fields.tag);
    const emptyA = a.fields.aliases.length === 0;
    const emptyB = b.fields.aliases.length === 0;
    if (emptyA || emptyB) return Number(emptyA) - Number(emptyB);
    return direction * compareText(a.fields.aliases, b.fields.aliases);
  });
  return keyed.map(({ row }) => row);
}

function compareText(a: string, b: string): number {
  const keyA = tagKey(a);
  const keyB = tagKey(b);
  if (keyA === keyB) return 0;
  return keyA < keyB ? -1 : 1;
}
