import { useMemo } from 'react';

import {
  buildHistoryCards,
  namesUpTo,
  sessionLabel,
  sessionNames,
  type HistoryCard,
  type NamedRunHistoryFile,
} from '@/queue/run-history-view';
import { useRunHistoryStore } from '@/store/use-run-history-store';

// ─────────────────────────────
// 履歴のカード。履歴のタブと履歴の詳細で同じ並びを使うので 1 か所で作る。
// ─────────────────────────────

/** 履歴のカードと、記録のファイルの並び・選んでいる範囲 */
interface HistoryCards {
  /** 中身を読んだファイルのカード。範囲の中で、時期の新しい順 */
  readonly cards: readonly HistoryCard[];
  /** 記録のファイル名。時期の古い順 */
  readonly names: readonly string[];
  /** それぞれの時期の表記（`names` と同じ並び） */
  readonly labels: readonly string[];
  /** 選んでいる範囲。読み直しで無くなったファイルは null（全部）として扱う */
  readonly range: string | null;
  /** 範囲の中のファイル名。時期の新しい順（出す分だけ中身を読む） */
  readonly rangeNames: readonly string[];
}

/** 実行の記録から、セッション（記録のファイル）ごとの履歴のカードを組み立てて返す */
export function useHistoryCards(): HistoryCards {
  const entries = useRunHistoryStore((state) => state.entries);
  const files = useRunHistoryStore((state) => state.files);
  const upTo = useRunHistoryStore((state) => state.upTo);
  // `cards` は履歴の詳細の送り（キーの受け口の effect の依存）に渡るので、そこまでは手で固定する
  const names = useMemo(() => sessionNames(entries), [entries]);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const labels = names.map((name) => {
    const entry = byName.get(name);
    return entry === undefined ? name : sessionLabel(entry);
  });
  const range = upTo !== null && names.includes(upTo) ? upTo : null;
  const rangeNames = useMemo(() => namesUpTo(names, range), [names, range]);
  const cards = useMemo(
    () =>
      buildHistoryCards(
        rangeNames.flatMap((name): NamedRunHistoryFile[] => {
          const file = files.get(name);
          return file === undefined ? [] : [[name, file]];
        }),
      ),
    [rangeNames, files],
  );

  return { cards, names, labels, range, rangeNames };
}
