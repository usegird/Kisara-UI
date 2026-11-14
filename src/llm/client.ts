import { isRecord } from '@/lib/guards';
import {
  BODY_MAX_BYTES,
  deadline,
  deliver,
  fail,
  newStreamState,
  readBody,
  readStream,
  rejection,
  type Deadline,
} from '@/llm/client-receive';
import {
  chatCompletionsUrl,
  isMixedContent,
  keyUrl,
  modelsUrl,
  normalizeLlmBaseUrl,
  propsUrl,
} from '@/llm/endpoints';
import { parseCompletionChunk, parseModelList, parsePropsContext } from '@/llm/schema';
import type {
  ChatCompletionRequest,
  ChatStreamReceiver,
  LlmEndpoint,
  LlmFailureKind,
  LlmPort,
  LlmResult,
  ModelList,
} from '@/port/llm-port';

// ─────────────────────────────
// LLM の HTTP 呼び出しの唯一の入口。失敗は原因ごとに分け、投げずに `LlmResult` で返す。
// ─────────────────────────────

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
/** これ以上の状態は接続先の側の失敗 */
const HTTP_SERVER_ERROR = 500;
/** `redirect: 'manual'` で転送が返ったときの応答の種類 */
const OPAQUE_REDIRECT = 'opaqueredirect';

/** 差し替えられる `fetch`（テストでは作り物を渡す） */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** LLM の窓口を作るときに渡すもの */
export interface LlmClientOptions {
  readonly fetch: FetchLike;
  /** 開いているページの経路（'https:' など）。ブラウザの外では null */
  readonly pageProtocol: () => string | null;
  /**
   * 整えたベース URL に付ける API キー。空なら認証のヘッダーを付けない。
   * キーを持つのはゲートウェイだけなので、本体の窓口は渡さない
   */
  readonly keyOf?: ((base: string) => string) | undefined;
}

function statusKind(status: number): LlmFailureKind {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'auth';
  if (status === HTTP_NOT_FOUND) return 'not-found';
  if (status === HTTP_TOO_MANY_REQUESTS) return 'rate-limit';
  if (status >= HTTP_SERVER_ERROR) return 'server';
  return 'rejected';
}

function headers(apiKey: string, json: boolean): Record<string, string> {
  const result: Record<string, string> = {
    Accept: json ? 'application/json' : 'text/event-stream',
  };
  if (json) result['Content-Type'] = 'application/json';
  if (apiKey.length > 0) result.Authorization = `Bearer ${apiKey}`;
  return result;
}

/** 送り先に付ける API キー。整えられないベース URL には付けない */
function keyFor(options: LlmClientOptions, endpoint: LlmEndpoint): string {
  const base = normalizeLlmBaseUrl(endpoint.baseUrl);
  return base === null ? '' : (options.keyOf?.(base) ?? '');
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ─────────────────────────────
// 待つ時間と受け取る量の上限
// ─────────────────────────────

/** モデルの一覧・キーの確かめ・文脈長の問い合わせを打ち切るまで（本文を読み終えるまで） */
const QUERY_TIMEOUT_MS = 10_000;
/** 生成で、最初の応答（本文の最初のひとかたまり）が来るまで */
const FIRST_RESPONSE_MS = 60_000;
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function failureOf<T>(response: Response): Promise<LlmResult<T>> {
  const raw = await readJson(response);
  return fail(statusKind(response.status), { status: response.status, ...rejection(raw) });
}

interface Sent {
  readonly response?: Response;
  readonly failure?: LlmResult<never>;
}

/** 送る。届かなければ原因を返す */
async function send(
  options: LlmClientOptions,
  endpoint: LlmEndpoint,
  request: { readonly toUrl: (base: string) => string; readonly init: RequestInit },
  limit?: Deadline,
): Promise<Sent> {
  const { toUrl, init } = request;
  const base = normalizeLlmBaseUrl(endpoint.baseUrl);
  if (base === null) return { failure: fail('not-found') };
  const url = toUrl(base);
  if (isMixedContent(url, options.pageProtocol())) return { failure: fail('mixed-content') };
  // キーを付けた要求は転送をたどらない。別のオリジンへの転送で認証のヘッダーを外すかはブラウザの版に任されるため
  const keyed = keyFor(options, endpoint).length > 0;
  try {
    if (!keyed) return { response: await options.fetch(url, init) };
    const response = await options.fetch(url, { ...init, redirect: 'manual' });
    return response.type === OPAQUE_REDIRECT ? { failure: fail('redirect') } : { response };
  } catch {
    if (limit?.expired() === true) return { failure: fail('timeout') };
    if (init.signal?.aborted === true) return { failure: fail('stopped') };
    return { failure: fail((await answers(options, modelsUrl(base))) ? 'cors' : 'unreachable') };
  }
}

/**
 * 中身を読まない要求（`no-cors`）が届くか。届けばサーバーは応答していて、
 * 断ったのは CORS。届かなければ応答が無い。キーは付けない（読めない応答に渡さない）
 */
async function answers(options: LlmClientOptions, url: string): Promise<boolean> {
  try {
    await options.fetch(url, { method: 'GET', mode: 'no-cors' });
    return true;
  } catch {
    return false;
  }
}

/** 問い合わせ（一覧・キー・文脈長）を送り、本文を上限の大きさまで読む */
async function query(
  options: LlmClientOptions,
  endpoint: LlmEndpoint,
  toUrl: (base: string) => string,
  signal: AbortSignal | undefined,
): Promise<LlmResult<{ readonly response: Response; readonly text: string | null }>> {
  const limit = deadline(signal, QUERY_TIMEOUT_MS);
  try {
    const init = {
      method: 'GET',
      headers: headers(keyFor(options, endpoint), true),
      signal: limit.signal,
    };
    const sent = await send(options, endpoint, { toUrl, init }, limit);
    if (sent.failure !== undefined) return sent.failure;
    const response = sent.response;
    if (response === undefined) return fail('unreachable');
    if (!response.ok) return { ok: true, value: { response, text: null } };
    const body = await readBody(response, BODY_MAX_BYTES, limit);
    return body.ok ? { ok: true, value: { response, text: body.value } } : body;
  } finally {
    limit.clear();
  }
}

/** llama.cpp の起動時の文脈長を読む。読めなければ null（一覧は返す） */
async function serverContext(
  options: LlmClientOptions,
  endpoint: LlmEndpoint,
  signal: AbortSignal | undefined,
): Promise<number | null> {
  const result = await query(options, endpoint, propsUrl, signal);
  if (!result.ok || result.value.text === null) return null;
  return parsePropsContext(parseJsonText(result.value.text));
}

/**
 * ストリーミングに応じないサーバーは 1 つの JSON で返す。本文を文字のまま読み、控えるときは
 * 控えに渡してから JSON にする
 */
async function readWholeReply(
  response: Response,
  { onEvent, signal, onRaw }: ChatStreamReceiver,
  limit: Deadline,
): Promise<LlmResult<null>> {
  const body = await readBody(response, BODY_MAX_BYTES, limit);
  if (signal.aborted) return fail('stopped');
  if (!body.ok) return body;
  onRaw?.(body.value);
  const whole = parseJsonText(body.value);
  const message = isRecord(whole) && whole.choices === undefined ? whole : null;
  if (message !== null && message.error !== undefined) {
    return fail('rejected', rejection(message));
  }
  const events = parseCompletionChunk(whole).map((event) =>
    event.kind === 'delta' ? { ...event, whole: true as const } : event,
  );
  const state = newStreamState();
  const failure = deliver(events, onEvent, state);
  if (failure !== null) return { ok: false, failure };
  return state.received ? { ok: true, value: null } : fail('bad-response');
}

/** OpenAI 互換の API を HTTP で叩く LLM の窓口を作る */
export function createLlmClient(options: LlmClientOptions): LlmPort {
  return {
    listModels: async (endpoint, signal) => {
      const result = await query(options, endpoint, modelsUrl, signal);
      if (!result.ok) return result;
      const { response, text } = result.value;
      if (text === null) return failureOf(response);
      const { ids, contexts, details, llamaCpp, truncated } = parseModelList(parseJsonText(text));
      const value: ModelList = {
        ids,
        contexts,
        details,
        serverContext: llamaCpp ? await serverContext(options, endpoint, signal) : null,
        truncated,
      };
      return { ok: true, value };
    },

    checkKey: async (endpoint, signal) => {
      const result = await query(options, endpoint, keyUrl, signal);
      if (!result.ok) return result;
      const { response, text } = result.value;
      return text === null ? failureOf(response) : { ok: true, value: null };
    },

    streamChat: async (endpoint, request: ChatCompletionRequest, { onEvent, signal, onRaw }) => {
      const limit = deadline(signal, FIRST_RESPONSE_MS);
      try {
        const init = {
          method: 'POST',
          headers: {
            ...headers(keyFor(options, endpoint), true),
            Accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify(request),
          signal: limit.signal,
        };
        const sent = await send(options, endpoint, { toUrl: chatCompletionsUrl, init }, limit);
        if (sent.failure !== undefined) return sent.failure;
        const response = sent.response;
        if (response === undefined) return fail('unreachable');
        if (!response.ok) return failureOf(response);

        const type = response.headers.get('content-type') ?? '';
        if (type.includes('text/event-stream') && response.body !== null) {
          return await readStream(response.body, onEvent, limit, onRaw);
        }
        return await readWholeReply(response, { onEvent, signal, onRaw }, limit);
      } finally {
        limit.clear();
      }
    },
  };
}
