import { chatNameFrom, selectedCandidate } from '@/chat/edit';
import type { Chat, ChatMeta } from '@/chat/types';
import { finiteNumber, isRecord, stringOr } from '@/lib/guards';
import { groupByPeriod, type ListPeriod } from '@/lib/list-period';

const HEAD_LENGTH = 40;

export function chatHead(chat: Chat, length = HEAD_LENGTH): string {
  const first = chat.messages.find((message) => message.role === 'user');
  const text = first === undefined ? '' : (selectedCandidate(first)?.content ?? '');
  const line = text.split('\n').find((item) => item.trim().length > 0) ?? '';
  return line.trim().replace(/\s+/g, ' ').slice(0, length);
}

export function headName(head: string): string {
  return chatNameFrom(head);
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function chatMeta(id: string, chat: Chat, size: number): ChatMeta {
  return {
    id,
    name: chat.name,
    head: chatHead(chat),
    size,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export function parseChatMeta(raw: unknown): ChatMeta | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null;
  return {
    id: raw.id,
    name: stringOr(raw.name),
    head: stringOr(raw.head),
    size: finiteNumber(raw.size) ?? 0,
    createdAt: finiteNumber(raw.createdAt) ?? 0,
    updatedAt: finiteNumber(raw.updatedAt) ?? 0,
  };
}

export type ChatPeriod = ListPeriod;

interface ChatGroup {
  readonly period: ChatPeriod | null;
  readonly items: readonly ChatMeta[];
}

export function arrangeChats(
  metas: readonly ChatMeta[],
  sort: 'recent' | 'size',
  now: number,
): ChatGroup[] {
  if (sort === 'size') {
    return [{ period: null, items: [...metas].sort((a, b) => b.size - a.size) }];
  }
  return groupByPeriod(metas, (meta) => meta.updatedAt, now);
}
