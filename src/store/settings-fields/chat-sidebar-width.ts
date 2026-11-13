import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 会話の左の列の幅。端末に残すので、読み戻した値を範囲に収める。
// ─────────────────────────────

export const CHAT_SIDEBAR_WIDTH = { initial: 248, min: 180, max: 480 } as const;

/** 幅を範囲に収める。数でなければ既定 */
export function normalizeChatSidebarWidth(value: unknown): number {
  return normalizeInRange(value, CHAT_SIDEBAR_WIDTH, { round: true });
}
