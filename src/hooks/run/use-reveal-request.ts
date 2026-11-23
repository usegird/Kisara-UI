import { useEffect } from 'react';

import type { NodeId } from '@/graph/types';
import { useRunReportStore } from '@/store/use-run-report-store';

export function useRevealRequest(revealCard: (id: NodeId) => void): void {
  const reveal = useRunReportStore((state) => state.reveal);
  const clearReveal = useRunReportStore((state) => state.clearReveal);

  useEffect(() => {
    if (reveal === null) return;
    revealCard(reveal.cardId);
    clearReveal();
  }, [reveal, revealCard, clearReveal]);
}
