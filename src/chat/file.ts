import { parseCandidate, parseSummary } from '@/chat/candidate-parse';
import { parseCharacterFields } from '@/chat/card';
import { parseLorebooks } from '@/chat/dictionary';
import { parseChatPlaybook, parseInstruction } from '@/chat/playbook-parse';
import { compositionOf, parsePersona, parseUnitLink } from '@/chat/prompt-parse';
import { pickGenerationParams } from '@/chat/request';
import { settleInterrupted } from '@/chat/stream-receive';
import type { Chat, ChatMessage } from '@/chat/types';
import { clamp } from '@/lib/clamp';
import { finiteNumber, isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import type { GenerationParams } from '@/port/llm-port';

// ─────────────────────────────
// 会話の中身の読み戻し。ブラウザの置き場の形を読む。API キーは持たない。
// 候補の読み戻しは candidate-parse.ts、書き出しの形は conversation-file.ts が持つ。
// ─────────────────────────────

function parseMessage(raw: unknown): ChatMessage | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;
  const candidates = isUnknownArray(raw.candidates)
    ? raw.candidates.flatMap((item) => parseCandidate(item) ?? [])
    : [];
  if (candidates.length === 0) return null;
  const selected = finiteNumber(raw.selected) ?? 0;
  return {
    id: raw.id,
    role: raw.role,
    candidates,
    selected: clamp(Math.trunc(selected), 0, candidates.length - 1),
    ...(raw.role === 'user' ? parseInstruction(raw.instruction) : {}),
  };
}

const NUMBER_PARAMS = [
  'temperature',
  'top_p',
  'max_tokens',
  'presence_penalty',
  'frequency_penalty',
  'seed',
] as const;

/** 生成の設定を読む。数でない値と、知らない項目は落とす */
export function parseParams(raw: unknown): GenerationParams {
  if (!isRecord(raw)) return {};
  const numbers: Record<string, number> = {};
  for (const key of NUMBER_PARAMS) {
    const value = finiteNumber(raw[key]);
    if (value !== null) numbers[key] = value;
  }
  const stop = isUnknownArray(raw.stop)
    ? raw.stop.filter((item): item is string => typeof item === 'string')
    : null;
  return pickGenerationParams({ ...numbers, ...(stop === null ? {} : { stop }) });
}

/** 会話の中身を読む。読めなければ null。受け取り中のまま残った候補は止めたものにする */
export function parseChat(raw: unknown): Chat | null {
  if (!isRecord(raw)) return null;
  const messages = isUnknownArray(raw.messages)
    ? raw.messages.flatMap((item) => parseMessage(item) ?? [])
    : [];
  const chat: Chat = {
    name: stringOr(raw.name),
    prompt: compositionOf(raw),
    preset: parseUnitLink(raw.preset),
    character: parseCharacterFields(raw.character),
    persona: parsePersona(raw.persona),
    messages,
    ...parseSummary(raw.summary),
    ...refsOf(raw),
    ...parseChatPlaybook(raw.playbook),
    createdAt: finiteNumber(raw.createdAt) ?? 0,
    updatedAt: finiteNumber(raw.updatedAt) ?? 0,
  };
  return settleInterrupted(chat);
}

/**
 * 置き場に残した会話を読む。発言か候補を 1 つでも読めなければ null（壊れている。黙って落とすと、次に
 * 書くときに欠けた形で上書きするため）
 */
export function parseIntactChat(raw: unknown): Chat | null {
  if (!isRecord(raw) || !isUnknownArray(raw.messages)) return null;
  const intact = raw.messages.every((item) => {
    const message = parseMessage(item);
    return (
      message !== null &&
      isRecord(item) &&
      isUnknownArray(item.candidates) &&
      message.candidates.length === item.candidates.length
    );
  });
  return intact ? parseChat(raw) : null;
}

/**
 * 会話が写した個別追加辞書の並びとアバターの id を読む。無ければ持たない
 */
export function refsOf(
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Pick<Chat, 'lorebooks' | 'imageId'> {
  const imageId =
    typeof raw?.imageId === 'string' || raw?.imageId === null ? raw.imageId : undefined;
  const lorebooks = parseLorebooks(raw?.lorebooks);
  return {
    ...(lorebooks === null ? {} : { lorebooks }),
    ...(imageId === undefined ? {} : { imageId }),
  };
}
