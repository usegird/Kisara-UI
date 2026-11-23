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
