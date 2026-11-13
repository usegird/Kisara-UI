import { normalizeInRange } from '@/lib/clamp';

// ─────────────────────────────
// 構成の相談の欄の幅。端末に残すので、読み戻した値を範囲に収める。
// ─────────────────────────────

export const PROMPT_ADVISOR_WIDTH = { initial: 420, min: 280, max: 800 } as const;

/** 幅を範囲に収める。数でなければ既定 */
export function normalizePromptAdvisorWidth(value: unknown): number {
  return normalizeInRange(value, PROMPT_ADVISOR_WIDTH, { round: true });
}
