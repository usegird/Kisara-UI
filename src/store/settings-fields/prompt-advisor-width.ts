import { normalizeInRange } from '@/lib/clamp';

export const PROMPT_ADVISOR_WIDTH = { initial: 420, min: 280, max: 800 } as const;

export function normalizePromptAdvisorWidth(value: unknown): number {
  return normalizeInRange(value, PROMPT_ADVISOR_WIDTH, { round: true });
}
