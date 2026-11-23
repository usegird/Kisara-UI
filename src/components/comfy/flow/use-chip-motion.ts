import type { MotionKind } from '@/components/comfy/flow/item-motion';
import type { NodeRowProps } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useSwipeIn, useSwipeOut } from '@/hooks/flow/use-flow-motion';

interface ChipMotion {
  readonly motion: MotionKind;
  readonly end: () => void;
  readonly start: () => void;
}

export function useChipMotion(
  row: NodeRowData,
  onDisconnect: NodeRowProps['onDisconnect'],
): ChipMotion {
  const linkId = row.kind === 'link' ? (row.source?.linkId ?? null) : null;
  const chipIn = useSwipeIn(linkId !== null);
  const chipOut = useSwipeOut(() => {
    if (linkId !== null) onDisconnect?.(linkId);
  });
  if (chipOut.leaving) return { motion: 'leave', end: chipOut.end, start: chipOut.start };
  return { motion: chipIn.entering ? 'enter' : 'none', end: chipIn.end, start: chipOut.start };
}
