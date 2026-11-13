import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 会話の画面に重ねるカード（プレイブック・構成の相談）の並びの幅。
// 端末に残すので、読み戻した値を範囲に収める。
// ─────────────────────────────

export const CHAT_CARD_WIDTH = { initial: 288, min: 224, max: 640 } as const;

/** 幅を範囲に収める。数でなければ既定 */
export function normalizeChatCardWidth(value: unknown): number {
  return normalizeInRange(value, CHAT_CARD_WIDTH, { round: true });
}
