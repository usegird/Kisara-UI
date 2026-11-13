import { isRecord } from '@/lib/guards';
import {
  isProcessingComment,
  parseCompletionChunk,
  parseContextOverflow,
  parseErrorMessage,
} from '@/llm/schema';
import { createSseReader, SseLineTooLongError } from '@/llm/sse';
import type { ChatStreamEvent, LlmFailure, LlmFailureKind, LlmResult } from '@/port/llm-port';

// ─────────────────────────────
// LLM の応答の受け取り。待つ時間と受け取る量の上限・本文と SSE の読み取り。
// ─────────────────────────────

/** 2 進の千と百万（大きさの上限の単位） */
const KIBI = 1024;

const MEBI = KIBI * KIBI;

/** 1 つの JSON で受け取る応答の大きさ（MB） */
const BODY_MAX_MEBIBYTES = 32;

/** 1 回の返事で受け取る本文の文字数の合計（百万字） */
const REPLY_MAX_MEBICHARS = 8;

/** 失敗の結果を作る */
export function fail<T>(kind: LlmFailureKind, extra: Omit<LlmFailure, 'kind'> = {}): LlmResult<T> {
  return { ok: false, failure: { kind, ...extra } };
}

/** 生成の途中で、次のひとかたまりが来るまで */
const STALL_MS = 30_000;

/**
 * 関数の呼び出しが届いた後で、次のひとかたまりが来るまで。呼び出しの名前だけを先に送り、
 * 引数は書き終えてからまとめて送るサーバーがあり、その間は何も届かない
 */
const TOOL_CALL_STALL_MS = 300_000;

/** 1 つの JSON で受け取る応答（一覧・ストリーミングに応じないサーバーの返事）の大きさ */
export const BODY_MAX_BYTES = BODY_MAX_MEBIBYTES * MEBI;

/** 1 回の返事で受け取る本文（思考・呼び出しの引数を含む）の文字数の合計 */
export const REPLY_MAX_CHARS = REPLY_MAX_MEBICHARS * MEBI;

/** 1 回の返事で受け取る関数の呼び出しの件数 */
export const TOOL_CALL_LIMIT = 128;

/** 呼び出し側の止める印に、時間切れを重ねた印。時間切れで止めたかを見分けられる */
export interface Deadline {
  readonly signal: AbortSignal;
  readonly expired: () => boolean;
  /** 時間を数え直す（ひとかたまり届いたとき） */
  readonly reset: (ms: number) => void;
  readonly clear: () => void;
}

/** 待つ時間の上限を付けた合図を作る。外の合図で止めても止まる */
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

/** 途中で止まった読み取りの原因 */
function cutOff<T>(limit: Deadline): LlmResult<T> {
  if (limit.expired()) return fail('timeout');
  return fail(limit.signal.aborted ? 'stopped' : 'interrupted');
}

/** 本文を上限の大きさまで文字で読む。超えたら読むのをやめる */
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

/**
 * 断りの中身。文脈の上限を超えた断りなら、上限と送った数も読む
 */
export function rejection(raw: unknown): Omit<LlmFailure, 'kind'> {
  const overflow = parseContextOverflow(raw);
  return { message: parseErrorMessage(raw), ...(overflow === undefined ? {} : { overflow }) };
}

/** SSE の 1 件の `data`。終わりの印なら 'done'、失敗の中身なら失敗 */
function readEvent(data: string): ChatStreamEvent[] | 'done' | LlmFailure {
  if (data.trim() === '[DONE]') return 'done';
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }
  // ストリームの途中で失敗を返すサーバーがある
  if (isRecord(parsed) && parsed.error !== undefined && parsed.choices === undefined) {
    return { kind: 'rejected', ...rejection(parsed) };
  }
  return parseCompletionChunk(parsed);
}

interface StreamState {
  received: boolean;
  /** 受け取った本文の文字数の合計 */
  chars: number;
  /** 届いた呼び出しの番号 → 詰めた位置（受け取った順に 0 から振る） */
  readonly toolIndexes: Map<number, number>;
}

/** 受け取りの途中の状態を作る */
export function newStreamState(): StreamState {
  return { received: false, chars: 0, toolIndexes: new Map() };
}

/**
 * 呼び出しの番号を、受け取った順に詰めた位置に置き換える（番号はサーバーが振るので、飛んだ番号や
 * 大きな番号でも穴を作らない）。上限の件数を超えた新しい呼び出しは null（飛ばす。受け取った中身の控えには残る）
 */
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

/** 届いた出来事を渡す。本文の合計が上限を超えたら、そこで渡すのをやめて失敗を返す */
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

/** SSE の本文を読み、届いたものを順に渡す */
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

  // 止めたら・時間が切れたら読み取りも止める（本文の読み取りを止めない fetch の実装でも、待ち続けない）
  const onAbort = (): void => void reader.cancel().catch(() => undefined);
  limit.signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (limit.signal.aborted) return cutOff(limit);
      const items = done ? sse.flush() : sse.push(decoder.decode(value, { stream: true }));
      const outcome = handle(items);
      // ひとかたまり届いたら、次を待つ時間を数え直す（注釈の行だけでも届いている）
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
