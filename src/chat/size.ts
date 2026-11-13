import type { Chat, ChatMessage } from '@/chat/types';
import { approxBytes } from '@/lib/approx-bytes';
import { normalizeInRange } from '@/lib/clamp';
import { MEGABYTE } from '@/lib/file-size';

// ─────────────────────────────
// 会話の大きさの上限と、一度に描く発言の数の設定と、会話の大きさの見積もり。
// ─────────────────────────────

/** 会話の大きさの上限（MB）の既定と範囲 */
export const CHAT_MAX_MB_DEFAULT = 10;
export const CHAT_MAX_MB_MIN = 1;
export const CHAT_MAX_MB_MAX = 400;

/** 一度に描く発言の数の既定と範囲 */
export const CHAT_LOG_WINDOW_DEFAULT = 100;
export const CHAT_LOG_WINDOW_MIN = 20;
export const CHAT_LOG_WINDOW_MAX = 1000;

/** 注意を出し始める割合 */
const NEAR_RATIO = 0.9;

// 上下限が整数なので、丸めてから収めても収めてから丸めても同じ値になる
function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  return normalizeInRange(value, { initial: fallback, min, max }, { round: true });
}

/** 会話の大きさの上限（MB）。読めない値は既定 */
export function normalizeChatMaxMegabytes(value: unknown): number {
  return normalizeInteger(value, CHAT_MAX_MB_DEFAULT, CHAT_MAX_MB_MIN, CHAT_MAX_MB_MAX);
}

/** 一度に描く発言の数。読めない値は既定 */
export function normalizeChatLogWindow(value: unknown): number {
  return normalizeInteger(value, CHAT_LOG_WINDOW_DEFAULT, CHAT_LOG_WINDOW_MIN, CHAT_LOG_WINDOW_MAX);
}

// 発言は書き換えると別の物になるので、発言ごとに見積もりを控え、受け取り中も変わった発言の分だけ数え直す
const messageBytes = new WeakMap<ChatMessage, number>();
const chatBytesCache = new WeakMap<Chat, number>();

function bytesOfMessage(message: ChatMessage): number {
  const known = messageBytes.get(message);
  if (known !== undefined) return known;
  const bytes = approxBytes(message);
  messageBytes.set(message, bytes);
  return bytes;
}

/** 会話の大きさの見積もり（バイト）。発言の外の持ち物も含む */
export function chatBytes(chat: Chat): number {
  const known = chatBytesCache.get(chat);
  if (known !== undefined) return known;
  const rest = approxBytes({ ...chat, messages: [] });
  const bytes = chat.messages.reduce((sum, message) => sum + bytesOfMessage(message), rest);
  chatBytesCache.set(chat, bytes);
  return bytes;
}

/** 上限に対する会話の大きさの段階 */
export type ChatSizeLevel = 'ok' | 'near' | 'full';

/** 上限に対する大きさの段階。上限を超えたら `full`、9 割を超えたら `near` */
export function chatSizeLevel(bytes: number, maxMegabytes: number): ChatSizeLevel {
  const limit = maxMegabytes * MEGABYTE;
  if (bytes > limit) return 'full';
  return bytes > limit * NEAR_RATIO ? 'near' : 'ok';
}
