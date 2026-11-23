import { assembleParts, droppableCount, mergeParts, summarizedCount } from '@/chat/assemble';
import { isStreaming, selectedCandidate } from '@/chat/edit';
import { NO_SOURCES, type PromptSources } from '@/chat/macros';
import type { Candidate, Chat, PromptComposition } from '@/chat/types';
import type { ChatContentPart, ChatRequestMessage } from '@/port/llm-port';

const ASCII_END = 0x80;
const ASCII_CHAR_TOKENS = 0.25;

export const IMAGE_TOKENS = 256;

const MESSAGE_OVERHEAD = 4;
const MIN_RATIO = 0.5;
const MAX_RATIO = 3;

const REPLY_RESERVE_SHARE = 4;
const MAX_REPLY_RESERVE = 4096;
export const NEAR_LIMIT_SHARE = 0.8;

export function inputLimitOf(context: number | null, maxTokens: number | undefined): number | null {
  if (context === null) return null;
  return Math.max(0, context - replyReserveOf(context, maxTokens));
}

export function replyReserveOf(context: number, maxTokens: number | undefined): number {
  if (maxTokens !== undefined) return maxTokens;
  return Math.min(MAX_REPLY_RESERVE, Math.floor(context / REPLY_RESERVE_SHARE));
}

export function isNearInputLimit(candidate: Candidate | undefined, limit: number | null): boolean {
  if (candidate === undefined || limit === null || limit === 0) return false;
  const { usage, sentEstimate } = candidate;
  const used = usage === undefined ? sentEstimate : usage.prompt + usage.completion;
  return used !== undefined && used >= limit * NEAR_LIMIT_SHARE;
}

export function estimateText(text: string): number {
  let total = 0;
  for (const char of text) {
    if (/\s/.test(char)) continue;
    total += (char.codePointAt(0) ?? 0) < ASCII_END ? ASCII_CHAR_TOKENS : 1;
  }
  return total;
}

function estimateCalls(message: ChatRequestMessage): number {
  if (!('tool_calls' in message)) return 0;
  return message.tool_calls.reduce(
    (sum, call) => sum + estimateText(call.function.name) + estimateText(call.function.arguments),
    0,
  );
}

function estimateContent(content: string | readonly ChatContentPart[] | null): number {
  if (content === null) return 0;
  if (typeof content === 'string') return estimateText(content);
  return content.reduce(
    (sum, part) => sum + (part.type === 'text' ? estimateText(part.text) : IMAGE_TOKENS),
    0,
  );
}

export function estimateMessages(messages: readonly ChatRequestMessage[]): number {
  return messages.reduce(
    (sum, message) =>
      sum + estimateContent(message.content) + estimateCalls(message) + MESSAGE_OVERHEAD,
    0,
  );
}

export function estimateTools(definitions: readonly unknown[]): number {
  return definitions.length === 0
    ? 0
    : estimateText(JSON.stringify(definitions)) + MESSAGE_OVERHEAD;
}

export interface SendBudget {
  readonly limit: number | null;
  readonly tools: number;
}

const NO_BUDGET: SendBudget = { limit: null, tools: 0 };

interface TokenEstimate {
  readonly items: ReadonlyMap<string, number>;
  readonly history: number;
  readonly total: number;
  readonly lastActual: number | null;
  readonly ratio: number;
  readonly drop: number;
  readonly kept: number;
  readonly summarized: number;
}

function actualOf(candidate: Candidate | undefined): number | null {
  if (candidate === undefined) return null;
  if (candidate.usage !== undefined) return candidate.usage.prompt;
  return candidate.end.kind === 'failed' ? (candidate.end.failure.overflow?.prompt ?? null) : null;
}

export function calibration(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources,
): { ratio: number; actual: number | null } {
  for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
    const message = chat.messages[index];
    const candidate = message === undefined ? undefined : selectedCandidate(message);
    const actual = actualOf(candidate);
    if (message?.role !== 'assistant' || actual === null) continue;
    const upTo = { ...chat, messages: chat.messages.slice(0, index + 1) };
    const estimated =
      candidate?.sentEstimate ??
      estimateMessages(mergeParts(assembleParts(upTo, composition, sources), squashOf(sources)));
    return { ratio: ratioOf(actual, estimated), actual };
  }
  return { ratio: 1, actual: null };
}

function squashOf(sources: PromptSources): boolean {
  return sources.squashSystem === true;
}

export function ratioOf(actual: number, estimated: number): number {
  return estimated <= 0 ? 1 : Math.min(MAX_RATIO, Math.max(MIN_RATIO, actual / estimated));
}

function rawEstimate(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources,
  drop: number,
): number {
  return estimateMessages(
    mergeParts(assembleParts(chat, composition, sources, drop), squashOf(sources)),
  );
}

export interface SendInput {
  readonly chat: Chat;
  readonly composition: PromptComposition;
  readonly sources: PromptSources;
}

export function fitDrop(
  { chat, composition, sources }: SendInput,
  budget: SendBudget,
  ratio: number,
): number {
  const limit = budget.limit;
  if (limit === null) return 0;
  const fits = (drop: number): boolean =>
    (rawEstimate(chat, composition, sources, drop) + budget.tools) * ratio <= limit;
  if (fits(0)) return 0;
  let low = 1;
  let high = droppableCount(chat);
  if (high === 0) return 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

interface SendPlan {
  readonly drop: number;
  readonly estimate: number;
}

export function planSend(
  send: SendInput,
  budget: SendBudget,
  ratio: number = calibration(send.chat, send.composition, send.sources).ratio,
): SendPlan {
  const drop = fitDrop(send, budget, ratio);
  const estimate = rawEstimate(send.chat, send.composition, send.sources, drop);
  return { drop, estimate: estimate + budget.tools };
}

export function estimateChat(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources = NO_SOURCES,
  budget: SendBudget = NO_BUDGET,
): TokenEstimate {
  const { ratio, actual } = calibration(chat, composition, sources);
  const shaped = withPending(chat);
  const drop = fitDrop({ chat: shaped, composition, sources }, budget, ratio);
  const parts = assembleParts(shaped, composition, sources, drop);
  const items = new Map<string, number>();
  let history = 0;
  for (const part of parts) {
    const value =
      estimateText(part.content) + (part.images?.length ?? 0) * IMAGE_TOKENS + MESSAGE_OVERHEAD;
    if (part.itemId === null) history += value;
    else items.set(part.itemId, (items.get(part.itemId) ?? 0) + value);
  }
  const scale = (value: number): number => Math.round(value * ratio);
  return {
    items: new Map([...items].map(([id, value]) => [id, scale(value)])),
    history: scale(history),
    total: scale(estimateMessages(mergeParts(parts, squashOf(sources)))),
    lastActual: actual,
    ratio,
    drop,
    kept: Math.max(0, shaped.messages.length - 1 - summarizedCount(shaped) - drop),
    summarized: summarizedCount(shaped),
  };
}

function withPending(chat: Chat): Chat {
  return isStreaming(chat) ? chat : { ...chat, messages: [...chat.messages, PENDING] };
}

const PENDING = {
  id: ':pending',
  role: 'assistant',
  candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
  selected: 0,
} as const;

export function estimateMessage(text: string, ratio: number): number {
  return text.length === 0 ? 0 : Math.round((estimateText(text) + MESSAGE_OVERHEAD) * ratio);
}
