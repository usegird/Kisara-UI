import { chatNameFrom, selectedCandidate } from '@/chat/edit';
import type { Chat, ChatMeta } from '@/chat/types';
import { finiteNumber, isRecord, stringOr } from '@/lib/guards';
import { groupByPeriod, type ListPeriod } from '@/lib/list-period';

// ─────────────────────────────
// 会話の一覧に出す項目。本文を読まずに一覧を出すため、会話を書くたびに一緒に書く。
// ─────────────────────────────

/** 見出しに出す最初の発言の長さ */
const HEAD_LENGTH = 40;

/** 最初の `user` の発言の、最初の空でない行の頭（空白は詰める） */
export function chatHead(chat: Chat, length = HEAD_LENGTH): string {
  const first = chat.messages.find((message) => message.role === 'user');
  const text = first === undefined ? '' : (selectedCandidate(first)?.content ?? '');
  const line = text.split('\n').find((item) => item.trim().length > 0) ?? '';
  return line.trim().replace(/\s+/g, ' ').slice(0, length);
}

/**
 * 名前が空の会話の見出し。一覧の項目の頭から、名前と同じ決まりで作る
 */
export function headName(head: string): string {
  return chatNameFrom(head);
}

/** 文字列を UTF-8 で書いたときの大きさ */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 会話から一覧の項目を作る。`size` は書いた大きさ */
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

/** 置き場から読んだ一覧の項目。形が違えば null */
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

/** 一覧の時期の区切り（今日・昨日・7 日以内・それより前。ワークフローの一覧と同じ） */
export type ChatPeriod = ListPeriod;

/** 一覧の 1 つの区切りと、その中の会話 */
interface ChatGroup {
  /** 時期の区切り。大きい順のときは null（区切らない） */
  readonly period: ChatPeriod | null;
  readonly items: readonly ChatMeta[];
}

/** 一覧の並び。最後に変えた順なら時期で区切り、大きい順なら区切らない */
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
