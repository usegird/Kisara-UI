import { normalizeInRange } from '@/lib/clamp';

export const CHAT_CARD_WIDTH = { initial: 288, min: 224, max: 640 } as const;

export function normalizeChatCardWidth(value: unknown): number {
  return normalizeInRange(value, CHAT_CARD_WIDTH, { round: true });
}
