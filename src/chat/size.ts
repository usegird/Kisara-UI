import type { Chat, ChatMessage } from '@/chat/types';
import { approxBytes } from '@/lib/approx-bytes';
import { normalizeInRange } from '@/lib/clamp';
import { MEGABYTE } from '@/lib/file-size';

export const CHAT_MAX_MB_DEFAULT = 10;
export const CHAT_MAX_MB_MIN = 1;
export const CHAT_MAX_MB_MAX = 400;

export const CHAT_LOG_WINDOW_DEFAULT = 100;
export const CHAT_LOG_WINDOW_MIN = 20;
export const CHAT_LOG_WINDOW_MAX = 1000;

const NEAR_RATIO = 0.9;

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  return normalizeInRange(value, { initial: fallback, min, max }, { round: true });
}

export function normalizeChatMaxMegabytes(value: unknown): number {
  return normalizeInteger(value, CHAT_MAX_MB_DEFAULT, CHAT_MAX_MB_MIN, CHAT_MAX_MB_MAX);
}

export function normalizeChatLogWindow(value: unknown): number {
  return normalizeInteger(value, CHAT_LOG_WINDOW_DEFAULT, CHAT_LOG_WINDOW_MIN, CHAT_LOG_WINDOW_MAX);
}

const messageBytes = new WeakMap<ChatMessage, number>();
const chatBytesCache = new WeakMap<Chat, number>();

function bytesOfMessage(message: ChatMessage): number {
  const known = messageBytes.get(message);
  if (known !== undefined) return known;
  const bytes = approxBytes(message);
  messageBytes.set(message, bytes);
  return bytes;
}

export function chatBytes(chat: Chat): number {
  const known = chatBytesCache.get(chat);
  if (known !== undefined) return known;
  const rest = approxBytes({ ...chat, messages: [] });
  const bytes = chat.messages.reduce((sum, message) => sum + bytesOfMessage(message), rest);
  chatBytesCache.set(chat, bytes);
  return bytes;
}

export type ChatSizeLevel = 'ok' | 'near' | 'full';

export function chatSizeLevel(bytes: number, maxMegabytes: number): ChatSizeLevel {
  const limit = maxMegabytes * MEGABYTE;
  if (bytes > limit) return 'full';
  return bytes > limit * NEAR_RATIO ? 'near' : 'ok';
}
