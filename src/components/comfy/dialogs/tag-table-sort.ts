import { tagKey } from '@/graph/tag-dictionary';

// ─────────────────────────────
// タグの表の並べ替え（列の見出しで選ぶ。選んでいなければ今までの並び）。画面を閉じたら忘れる。
// ─────────────────────────────

/** 並べ替える列 */
export type TagSortKey = 'tag' | 'aliases' | 'priority';

/** 選んでいる並べ替え */
export interface TagSort {
  readonly key: TagSortKey;
  readonly ascending: boolean;
}

/** 並べ替えに使う行の中身 */
export interface TagSortFields {
  readonly tag: string;
  /** 別名を `,` でつないだもの。無ければ空 */
  readonly aliases: string;
  readonly priority: number;
}

/** 見出しを押したときの次の並べ替え。別の列なら昇順、同じ列なら昇順 → 降順 → 選ばない */
export function nextTagSort(current: TagSort | null, key: TagSortKey): TagSort | null {
  if (current?.key !== key) return { key, ascending: true };
  return current.ascending ? { key, ascending: false } : null;
}

/**
 * 行を並べ替える。選んでいなければそのまま。別名の無い行は向きに関わらず後ろに置く
 * （別名で並べたいときに、別名の無い大半の行が前に来ないように）。同じ値なら元の並び
 */
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
