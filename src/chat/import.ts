import {
  isConversationsFile,
  parseConversations,
  type ParsedChats,
} from '@/chat/conversation-file-parse';
import { EMPTY_CHAT, type Candidate, type Chat, type ChatMessage } from '@/chat/types';
import { clamp } from '@/lib/clamp';
import { MEGABYTE } from '@/lib/file-size';
import { finiteNumber, isRecord, isUnknownArray, stringOr } from '@/lib/guards';

// ─────────────────────────────
// 会話のファイルの読み込み。どの形かは中身で見分ける（拡張子に頼らない）。
// ChatGPT・Claude・SillyTavern の形は公開の仕様が無いので、読める項目だけで組む。
// ─────────────────────────────

/** 読み込む会話のファイルの大きさの上限（MB） */
const CHAT_FILE_MAX_MEGABYTES = 512;

function done(content: string): Candidate {
  return { content, reasoning: '', end: { kind: 'done', reason: null } };
}

function time(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ─────────────────────────────
// Claude の書き出し
// ─────────────────────────────

/** Claude の書き出しの話し手を、会話の役にする。知らない話し手は null */
function claudeRoleOf(sender: unknown): 'user' | 'assistant' | null {
  if (sender === 'human') return 'user';
  return sender === 'assistant' ? sender : null;
}

/** 時刻の候補のうち、最初の正の値。どれも無ければ `fallback` */
function firstTimeOf(times: readonly number[], fallback: number): number {
  return times.find((value) => value > 0) ?? fallback;
}

function isClaudeFile(raw: unknown): raw is unknown[] {
  const first = isUnknownArray(raw) ? raw[0] : undefined;
  return isRecord(first) && isUnknownArray(first.chat_messages);
}

/** 発言の本文。`text` が無ければ `content` の文の部分をつなぐ */
function claudeText(message: Record<string, unknown>): string {
  if (typeof message.text === 'string' && message.text.length > 0) return message.text;
  if (!isUnknownArray(message.content)) return '';
  return message.content
    .flatMap((part) => (isRecord(part) && part.type === 'text' ? [stringOr(part.text)] : []))
    .join('\n');
}

function parseClaude(raw: readonly unknown[]): ParsedChats {
  const chats: Chat[] = [];
  let skipped = 0;
  let dropped = 0;
  for (const item of raw) {
    if (!isRecord(item) || !isUnknownArray(item.chat_messages)) {
      skipped += 1;
      continue;
    }
    const messages: ChatMessage[] = [];
    item.chat_messages.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      for (const key of ['attachments', 'files'] as const) {
        const list = entry[key];
        if (isUnknownArray(list)) dropped += list.length;
      }
      const role = claudeRoleOf(entry.sender);
      const body = claudeText(entry);
      if (role === null || body.length === 0) return;
      const id = typeof entry.uuid === 'string' ? entry.uuid : `m${String(index)}`;
      messages.push({ id, role, candidates: [done(body)], selected: 0 });
    });
    if (messages.length === 0) {
      skipped += 1;
      continue;
    }
    chats.push({
      ...EMPTY_CHAT,
      name: stringOr(item.name),
      messages,
      createdAt: time(item.created_at),
      updatedAt: time(item.updated_at),
    });
  }
  return { chats, skipped, dropped };
}

// ─────────────────────────────
// SillyTavern の会話
// ─────────────────────────────

function jsonLines(source: string): unknown[] | null {
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;
  try {
    return lines.map((line) => JSON.parse(line) as unknown);
  } catch {
    return null;
  }
}

function isSillyTavern(lines: readonly unknown[]): boolean {
  return lines.some((line) => isRecord(line) && typeof line.mes === 'string');
}

/** 1 件の発言。候補（`swipes`）と選んでいる候補（`swipe_id`）、思考の本文を読む */
function sillyTavernMessage(line: Record<string, unknown>, id: string): ChatMessage | null {
  if (line.is_system === true) return null;
  const role = line.is_user === true ? 'user' : 'assistant';
  const swipes = isUnknownArray(line.swipes)
    ? line.swipes.filter((swipe): swipe is string => typeof swipe === 'string')
    : [];
  const contents = role === 'assistant' && swipes.length > 0 ? swipes : [stringOr(line.mes)];
  const rawSelected = finiteNumber(line.swipe_id) ?? 0;
  const selected = clamp(Math.trunc(rawSelected), 0, contents.length - 1);
  const extra = isRecord(line.extra) ? line.extra : null;
  const candidates = contents.map((content, index) => ({
    ...done(content),
    reasoning: index === selected ? stringOr(extra?.reasoning) : '',
  }));
  if (candidates.every((candidate) => candidate.content.length === 0)) return null;
  return { id, role, candidates, selected };
}

function parseSillyTavern(lines: readonly unknown[], fileName: string): ParsedChats {
  const header = lines.find((line) => isRecord(line) && typeof line.mes !== 'string');
  const messages: ChatMessage[] = [];
  lines.forEach((line, index) => {
    if (!isRecord(line) || typeof line.mes !== 'string') return;
    const message = sillyTavernMessage(line, `m${String(index)}`);
    if (message !== null) messages.push(message);
  });
  if (messages.length === 0) return { chats: [], skipped: 1, dropped: 0 };
  const name = isRecord(header) ? stringOr(header.character_name) : '';
  const created = isRecord(header) ? time(header.create_date) : 0;
  return {
    chats: [
      { ...EMPTY_CHAT, name: name.length > 0 ? name : fileName, messages, createdAt: created },
    ],
    skipped: 0,
    dropped: 0,
  };
}

// ─────────────────────────────
// 見分けて読む
// ─────────────────────────────

/** 拡張子を除いたファイル名（名前の無い会話の名前に使う） */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, '').replace(/\.chat$/, '');
}

/**
 * 読み込む会話のファイルの大きさの上限。ChatGPT の書き出しは全部の会話をまとめるので大きくなる
 */
export const CHAT_FILE_MAX_BYTES = CHAT_FILE_MAX_MEGABYTES * MEGABYTE;

/**
 * 会話のファイルを読む。読めない形なら null。名前の無い会話 1 つのファイルはファイル名を名前にし、
 * 時刻の無い会話は `now` にする
 */
export function readChatFile(source: string, fileName: string, now: number): ParsedChats | null {
  let raw: unknown;
  let parsed: ParsedChats | null = null;
  try {
    raw = JSON.parse(source) as unknown;
  } catch {
    raw = undefined;
  }

  if (raw === undefined) {
    const lines = jsonLines(source);
    if (lines !== null && isSillyTavern(lines))
      parsed = parseSillyTavern(lines, baseName(fileName));
  } else if (isConversationsFile(raw)) {
    parsed = parseConversations(raw);
  } else if (isClaudeFile(raw)) {
    parsed = parseClaude(raw);
  }
  if (parsed === null) return null;

  const single = parsed.chats.length === 1;
  return {
    ...parsed,
    chats: parsed.chats.map((chat) => ({
      ...chat,
      name: chat.name.length === 0 && single ? baseName(fileName) : chat.name,
      createdAt: chat.createdAt > 0 ? chat.createdAt : now,
      updatedAt: firstTimeOf([chat.updatedAt, chat.createdAt], now),
    })),
  };
}
