import { normalizeInRange } from '@/lib/clamp';

export const CHAT_SIDEBAR_WIDTH = { initial: 248, min: 180, max: 480 } as const;

export function normalizeChatSidebarWidth(value: unknown): number {
  return normalizeInRange(value, CHAT_SIDEBAR_WIDTH, { round: true });
}
