import type { MotionKind } from '@/components/comfy/flow/item-motion';
import type { NodeRowProps } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import { useSwipeIn, useSwipeOut } from '@/hooks/flow/use-flow-motion';

// ─────────────────────────────
// チップが付いた・外れたときの動きの状態
// ─────────────────────────────

interface ChipMotion {
  readonly motion: MotionKind;
  /** 動きが終わった（`animationend`） */
  readonly end: () => void;
  /** 右へ抜けさせてから接続を解除する */
  readonly start: () => void;
}

/**
 * 繋いで現れたチップは右から滑り込み、解除のボタンでは右へ抜けてから切る。
 * 行の中身で呼ぶ（行が widget から接続済みに変わったことを前の描画と比べて知るため。
 * チップの部品の中で呼ぶと、現れた時点で「最初から真」になって動かない）
 */
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
