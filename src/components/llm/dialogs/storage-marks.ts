import type { Entry } from '@/components/llm/dialogs/storage-entries';

// ─────────────────────────────
// ストレージの管理の印の付け方。削除・戻すの印を付け外し、種類ごとに数える（描かない）。
// 印は「適用」でまとめて行う。
// ─────────────────────────────

/** 適用で行う印。ブラウザの欄の削除・控えの欄の削除・控えから戻す */
export interface Mark {
  readonly entryId: string;
  readonly side: 'browser' | 'backup' | 'restore';
  readonly key: string;
}

/** 付けた印（`markKey` → 印） */
export type Marks = ReadonlyMap<string, Mark>;

/** 印の鍵（種類・欄・1 件） */
export const markKey = (mark: Mark): string => JSON.stringify([mark.entryId, mark.side, mark.key]);

/** 印を付け外す。すべてに付いていれば外し、ほかは付ける（ブラウザの削除と戻すは片方だけ） */
export function toggleMarks(current: Marks, targets: readonly Mark[]): Marks {
  const next = new Map(current);
  const all = targets.every((mark) => current.has(markKey(mark)));
  for (const mark of targets) {
    if (all) {
      next.delete(markKey(mark));
      continue;
    }
    next.set(markKey(mark), mark);
    // ブラウザの削除と戻すは片方だけ
    const rival = rivalOf(mark);
    if (rival !== null) next.delete(markKey(rival));
  }
  return next;
}

/** 種類のバックアップの列の印（戻す・バックアップの削除）を外す。列の中身を替えるとき */
export function withoutReferenceMarks(current: Marks, entryId: string): Marks {
  const kept = [...current].filter(
    ([, mark]) => mark.entryId !== entryId || mark.side === 'browser',
  );
  return new Map(kept);
}

/** 種類に付けた印の数（＋ 戻す・− 消す・上書き）。ブラウザにある 1 件へ戻すのは上書きなので両方に数える */
export function markCounts(
  entry: Entry,
  marks: Marks,
): { readonly plus: number; readonly minus: number } {
  const present = new Set(entry.items.map((item) => item.key));
  let plus = 0;
  let minus = 0;
  for (const mark of marks.values()) {
    if (mark.entryId !== entry.id) continue;
    if (mark.side !== 'restore') {
      minus += 1;
      continue;
    }
    plus += 1;
    if (present.has(mark.key)) minus += 1;
  }
  return { plus, minus };
}

/** ブラウザの削除と戻すは片方だけ。付ける印と入れ替わる相手 */
function rivalOf(mark: Mark): Mark | null {
  if (mark.side === 'backup') return null;
  return { ...mark, side: mark.side === 'browser' ? 'restore' : 'browser' };
}
