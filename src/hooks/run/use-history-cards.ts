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

interface HistoryCards {
  readonly cards: readonly HistoryCard[];
  readonly names: readonly string[];
  readonly labels: readonly string[];
  readonly range: string | null;
  readonly rangeNames: readonly string[];
}

export function useHistoryCards(): HistoryCards {
  const entries = useRunHistoryStore((state) => state.entries);
  const files = useRunHistoryStore((state) => state.files);
  const upTo = useRunHistoryStore((state) => state.upTo);
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
