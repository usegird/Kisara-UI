import { isRecord } from '@/lib/guards';
import {
  isProcessingComment,
  parseCompletionChunk,
  parseContextOverflow,
  parseErrorMessage,
} from '@/llm/schema';
import { createSseReader, SseLineTooLongError } from '@/llm/sse';
import type { ChatStreamEvent, LlmFailure, LlmFailureKind, LlmResult } from '@/port/llm-port';

const KIBI = 1024;

const MEBI = KIBI * KIBI;

const BODY_MAX_MEBIBYTES = 32;

const REPLY_MAX_MEBICHARS = 8;

export function fail<T>(kind: LlmFailureKind, extra: Omit<LlmFailure, 'kind'> = {}): LlmResult<T> {
  return { ok: false, failure: { kind, ...extra } };
}

const STALL_MS = 30_000;

const TOOL_CALL_STALL_MS = 300_000;

export const BODY_MAX_BYTES = BODY_MAX_MEBIBYTES * MEBI;

export const REPLY_MAX_CHARS = REPLY_MAX_MEBICHARS * MEBI;

export const TOOL_CALL_LIMIT = 128;

export interface Deadline {
  readonly signal: AbortSignal;
  readonly expired: () => boolean;
  readonly reset: (ms: number) => void;
  readonly clear: () => void;
}

export function deadline(outer: AbortSignal | undefined, ms: number): Deadline {
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = (next: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      expired = true;
      controller.abort(new DOMException('timeout', 'TimeoutError'));
    }, next);
  };
  const onAbort = (): void => controller.abort(outer?.reason);
  if (outer?.aborted === true) controller.abort(outer.reason);
  else outer?.addEventListener('abort', onAbort, { once: true });
  reset(ms);
  return {
    signal: controller.signal,
    expired: () => expired,
    reset,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

function cutOff<T>(limit: Deadline): LlmResult<T> {
  if (limit.expired()) return fail('timeout');
  return fail(limit.signal.aborted ? 'stopped' : 'interrupted');
}

export async function readBody(
  response: Response,
  maxBytes: number,
  limit: Deadline,
): Promise<LlmResult<string>> {
  try {
    if (response.body === null) return { ok: true, value: await response.text() };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return fail('response-too-large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return { ok: true, value: text + decoder.decode() };
  } catch {
    return cutOff(limit);
  }
}

export function rejection(raw: unknown): Omit<LlmFailure, 'kind'> {
  const overflow = parseContextOverflow(raw);
  return { message: parseErrorMessage(raw), ...(overflow === undefined ? {} : { overflow }) };
}

function readEvent(data: string): ChatStreamEvent[] | 'done' | LlmFailure {
  if (data.trim() === '[DONE]') return 'done';
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }
  if (isRecord(parsed) && parsed.error !== undefined && parsed.choices === undefined) {
    return { kind: 'rejected', ...rejection(parsed) };
  }
  return parseCompletionChunk(parsed);
}

interface StreamState {
  received: boolean;
  chars: number;
  readonly toolIndexes: Map<number, number>;
}

export function newStreamState(): StreamState {
  return { received: false, chars: 0, toolIndexes: new Map() };
}

function compactToolCall(
  event: Extract<ChatStreamEvent, { kind: 'tool-call' }>,
  state: StreamState,
): ChatStreamEvent | null {
  let position = state.toolIndexes.get(event.index);
  if (position === undefined) {
    if (state.toolIndexes.size >= TOOL_CALL_LIMIT) return null;
    position = state.toolIndexes.size;
    state.toolIndexes.set(event.index, position);
  }
  return { ...event, index: position };
}

function eventChars(event: ChatStreamEvent): number {
  if (event.kind === 'delta') return event.content.length + event.reasoning.length;
  if (event.kind === 'tool-call') return event.name.length + event.arguments.length;
  return 0;
}

export function deliver(
  events: ChatStreamEvent[],
  onEvent: (event: ChatStreamEvent) => void,
  state: StreamState,
): LlmFailure | null {
  for (const raw of events) {
    const event = raw.kind === 'tool-call' ? compactToolCall(raw, state) : raw;
    if (event === null) continue;
    state.chars += eventChars(event);
    if (state.chars > REPLY_MAX_CHARS) return { kind: 'response-too-large' };
    if (event.kind === 'delta' || event.kind === 'tool-call') state.received = true;
    onEvent(event);
  }
  return null;
}

export async function readStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  limit: Deadline,
  onRaw: ((text: string) => void) | undefined,
): Promise<LlmResult<null>> {
  const state = newStreamState();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const sse = createSseReader({
    onComment: (text) => {
      if (isProcessingComment(text)) onEvent({ kind: 'processing' });
    },
    ...(onRaw === undefined ? {} : { onLine: onRaw }),
  });

  const handle = (items: string[]): LlmResult<null> | 'done' | null => {
    for (const data of items) {
      const result = readEvent(data);
      if (result === 'done') return 'done';
      if (!Array.isArray(result)) return { ok: false, failure: result };
      const failure = deliver(result, onEvent, state);
      if (failure !== null) return { ok: false, failure };
    }
    return null;
  };

  const onAbort = (): void => void reader.cancel().catch(() => undefined);
  limit.signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (limit.signal.aborted) return cutOff(limit);
      const items = done ? sse.flush() : sse.push(decoder.decode(value, { stream: true }));
      const outcome = handle(items);
      limit.reset(state.toolIndexes.size > 0 ? TOOL_CALL_STALL_MS : STALL_MS);
      if (outcome === 'done') break;
      if (outcome !== null) return outcome;
      if (done) break;
    }
  } catch (error) {
    if (error instanceof SseLineTooLongError) return fail('response-too-large');
    return cutOff(limit);
  } finally {
    limit.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  return state.received ? { ok: true, value: null } : fail('bad-response');
}
