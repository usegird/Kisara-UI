import type { PlaybookInstruction } from '@/chat/playbook';
import { canWriteReply } from '@/chat/tool-calls';
import type { Candidate, Chat, ChatMessage } from '@/chat/types';

const LATIN1_LAST = 0xff;
const HALFWIDTH_KANA_FIRST = 0xff61;
const HALFWIDTH_KANA_LAST = 0xff9f;

const STREAMING: Candidate = { content: '', reasoning: '', end: { kind: 'streaming' } };

export function selectedCandidate(message: ChatMessage): Candidate | undefined {
  return message.candidates[message.selected];
}

export function isStreaming(chat: Chat): boolean {
  const last = chat.messages.at(-1);
  return last !== undefined && selectedCandidate(last)?.end.kind === 'streaming';
}

function sameExcept(a: object, b: object, skip: ReadonlySet<string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!skip.has(key) && !Object.is(Reflect.get(a, key), Reflect.get(b, key))) return false;
  }
  return true;
}

const MESSAGES = new Set(['messages']);
const CANDIDATES = new Set(['candidates']);
const TEXT = new Set(['content', 'reasoning']);

export function sameExceptStreamingText(a: Chat | undefined, b: Chat | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (!isStreaming(a) || !isStreaming(b) || !sameExcept(a, b, MESSAGES)) return false;
  const count = a.messages.length;
  if (count !== b.messages.length) return false;
  for (let index = 0; index < count - 1; index += 1) {
    if (a.messages[index] !== b.messages[index]) return false;
  }
  const lastA = a.messages[count - 1];
  const lastB = b.messages[count - 1];
  if (lastA === undefined || lastB === undefined || !sameExcept(lastA, lastB, CANDIDATES)) {
    return false;
  }
  if (lastA.candidates.length !== lastB.candidates.length) return false;
  return lastA.candidates.every((candidate, index) => {
    const other = lastB.candidates[index];
    if (other === undefined) return false;
    return index === lastA.selected ? sameExcept(candidate, other, TEXT) : candidate === other;
  });
}

export function replaceLast(chat: Chat, update: (message: ChatMessage) => ChatMessage): Chat {
  const last = chat.messages.at(-1);
  if (last === undefined) return chat;
  return { ...chat, messages: [...chat.messages.slice(0, -1), update(last)] };
}

export function withCandidate(message: ChatMessage, candidate: Candidate): ChatMessage {
  const candidates = [...message.candidates];
  candidates[message.selected] = candidate;
  return { ...message, candidates };
}

function streamingAssistant(id: string): ChatMessage {
  return { id, role: 'assistant', candidates: [STREAMING], selected: 0 };
}

const NAME_WIDTH = 20;

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code <= LATIN1_LAST || (code >= HALFWIDTH_KANA_FIRST && code <= HALFWIDTH_KANA_LAST)
    ? 1
    : 2;
}

export function chatNameFrom(text: string): string {
  const line =
    text
      .split('\n')
      .map((item) => item.trim().replace(/\s+/g, ' '))
      .find((item) => item.length > 0) ?? '';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let width = 0;
  let name = '';
  for (const { segment } of segmenter.segment(line)) {
    width += charWidth(segment);
    if (width > NAME_WIDTH) break;
    name += segment;
  }
  return name.trimEnd();
}

export interface NewTurn {
  readonly text: string;
  readonly userId: string;
  readonly assistantId: string;
  readonly images?: readonly string[] | undefined;
  readonly instruction?: PlaybookInstruction | undefined;
}

export function appendTurn(
  chat: Chat,
  { text, userId, assistantId, images = [], instruction }: NewTurn,
): Chat {
  const user: ChatMessage = {
    id: userId,
    role: 'user',
    candidates: [
      {
        content: text,
        reasoning: '',
        end: { kind: 'done', reason: null },
        ...(images.length > 0 ? { images: [...images] } : {}),
      },
    ],
    selected: 0,
    ...(instruction === undefined ? {} : { instruction }),
  };
  const first = !chat.messages.some((message) => message.role === 'user');
  const name = chat.name.trim().length === 0 && first ? chatNameFrom(text) : chat.name;
  return { ...chat, name, messages: [...chat.messages, user, streamingAssistant(assistantId)] };
}

export function regenerate(chat: Chat, instruction = ''): Chat | null {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant' || isStreaming(chat)) return null;
  const candidate: Candidate =
    instruction.trim().length === 0
      ? STREAMING
      : { ...STREAMING, revision: { base: last.selected, instruction } };
  return replaceLast(chat, (message) => ({
    ...message,
    candidates: [...message.candidates, candidate],
    selected: message.candidates.length,
  }));
}

export function retry(chat: Chat): Chat | null {
  const last = chat.messages.at(-1);
  if (last?.role !== 'assistant' || isStreaming(chat)) return null;
  if (last.candidates[last.selected]?.end.kind !== 'failed') return regenerate(chat);
  return replaceLast(chat, (message) => {
    const candidates = [...message.candidates];
    const revision = candidates[message.selected]?.revision;
    candidates[message.selected] = revision === undefined ? STREAMING : { ...STREAMING, revision };
    return { ...message, candidates };
  });
}

export function writeReply(chat: Chat): Chat | null {
  const last = chat.messages.at(-1);
  const candidate = last === undefined ? undefined : selectedCandidate(last);
  if (last?.role !== 'assistant' || candidate === undefined || !canWriteReply(candidate)) {
    return null;
  }
  const { finishReason, ...rest } = candidate;
  void finishReason;
  const reasoning = rest.reasoning.trim().length === 0 ? '' : `${rest.reasoning.trimEnd()}\n\n`;
  return replaceLast(chat, (message) =>
    withCandidate(message, { ...rest, content: '', reasoning, end: { kind: 'streaming' } }),
  );
}

export function respondWith(
  chat: Chat,
  contents: readonly string[],
  selected: number,
  id: string,
): Chat | null {
  if (isStreaming(chat)) return null;
  const filled = contents.flatMap((content, index) =>
    content.trim().length === 0 ? [] : [{ content, index }],
  );
  if (filled.length === 0) return null;
  const candidates: Candidate[] = filled.map(({ content }) => ({
    content,
    reasoning: '',
    end: { kind: 'done', reason: null },
  }));
  const at = Math.max(
    0,
    filled.findIndex(({ index }) => index === selected),
  );
  const message: ChatMessage = { id, role: 'assistant', candidates, selected: at };
  return { ...chat, messages: [...chat.messages, message] };
}

export function rollback(
  chat: Chat,
  messageId: string,
): { readonly chat: Chat; readonly content: string; readonly images: readonly string[] } | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  if (message?.role !== 'user' || isStreaming(chat)) return null;
  const candidate = selectedCandidate(message);
  return {
    chat: { ...chat, messages: chat.messages.slice(0, index) },
    content: candidate?.content ?? '',
    images: candidate?.images ?? [],
  };
}

export function forkedChat(chat: Chat, messageId: string): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  if (chat.messages[index]?.role !== 'assistant' || isStreaming(chat)) return null;
  return { ...chat, messages: chat.messages.slice(0, index + 1) };
}

export function hasMessagesAfter(chat: Chat, messageId: string): boolean {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  return index >= 0 && index < chat.messages.length - 1;
}

function updateMessage(
  chat: Chat,
  messageId: string,
  update: (message: ChatMessage) => ChatMessage | null,
): Chat | null {
  const index = chat.messages.findIndex((message) => message.id === messageId);
  const message = chat.messages[index];
  if (message === undefined) return null;
  const next = update(message);
  if (next === null) return null;
  const messages = [...chat.messages];
  messages[index] = next;
  return { ...chat, messages };
}

export function selectCandidate(chat: Chat, messageId: string, index: number): Chat | null {
  if (isStreaming(chat)) return null;
  return updateMessage(chat, messageId, (message) =>
    index < 0 || index >= message.candidates.length || index === message.selected
      ? null
      : { ...message, selected: index },
  );
}

export function editMessage(chat: Chat, messageId: string, content: string): Chat | null {
  if (isStreaming(chat)) return null;
  return updateMessage(chat, messageId, (message) => {
    const candidate = selectedCandidate(message);
    if (candidate === undefined || candidate.content === content) return null;
    return withCandidate(message, { ...candidate, content });
  });
}

export function removeMessage(chat: Chat, messageId: string): Chat | null {
  if (isStreaming(chat) || !chat.messages.some((message) => message.id === messageId)) return null;
  return { ...chat, messages: chat.messages.filter((message) => message.id !== messageId) };
}
