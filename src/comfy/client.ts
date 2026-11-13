import { ComfyRequestError, type RequestOptions } from '@/comfy/request-error';

// ─────────────────────────────
// ComfyUI への HTTP アクセスの唯一の入口。失敗は、接続の案内が原因別に出せるよう種別と理由の符号付きで返す。
// ─────────────────────────────

export { ComfyRequestError, type FetchLike, type RequestOptions } from '@/comfy/request-error';

const DEFAULT_TIMEOUT_MS = 30_000;

interface SendOptions extends RequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
  /** JSON 化せずそのまま送る本文 */
  readonly rawBody?: string;
  /** multipart の本文。区切りはブラウザが付けるので Content-Type は書かない */
  readonly form?: FormData;
  /** 画像などの生データ。種類は Blob のものを送る */
  readonly blob?: Blob;
}

async function send(url: string, options: SendOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    timeoutMs,
  );
  const onExternalAbort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const init = buildRequestInit(options, controller.signal);

  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    // ブラウザは CORS 拒否・Local Network Access 拒否・接続不能をすべて TypeError にする。
    // 切り分けは diagnose.ts の推定に委ねる。
    throw sendFailure(url, cause, controller.signal, { signal: options.signal, timeoutMs });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) {
    // 本文に検証エラー（`POST /prompt` の node_errors）が載ることがある。
    // 捨てると「どのノードが悪いか」を出せなくなるので拾っておく
    throw httpFailure(url, response, await readJson(response));
  }

  const text = await response.text();
  if (text.length === 0) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ComfyRequestError('parse', url, { cause });
  }
}

/** 送る指定から `fetch` の指定を組み立てる。本文は multipart・生データ・文字・JSON の順に見る */
function buildRequestInit(options: SendOptions, signal: AbortSignal): RequestInit {
  const init: RequestInit = { method: options.method ?? 'GET', signal };
  if (options.cache !== undefined) init.cache = options.cache;
  if (options.form !== undefined) {
    init.body = options.form;
  } else if (options.blob !== undefined) {
    init.headers = { 'Content-Type': options.blob.type || 'application/octet-stream' };
    init.body = options.blob;
  } else if (options.rawBody !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = options.rawBody;
  } else if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  return init;
}

/** 送れなかった失敗を、取りやめ・時間切れ・届かないに分ける */
function sendFailure(
  url: string,
  cause: unknown,
  own: AbortSignal,
  { signal, timeoutMs }: { readonly signal: AbortSignal | undefined; readonly timeoutMs: number },
): ComfyRequestError {
  if (signal?.aborted === true) return new ComfyRequestError('aborted', url, { cause });
  if (own.aborted) {
    return new ComfyRequestError('timeout', url, { cause, params: { ms: timeoutMs } });
  }
  return new ComfyRequestError('unreachable', url, { cause });
}

/** HTTP エラーの失敗。文は `HTTP 404 Not Found` の形（訳さない） */
function httpFailure(
  url: string,
  response: Response,
  body: unknown,
  reasonCode: 'http' | 'fetch-failed' = 'http',
): ComfyRequestError {
  const { status, statusText } = response;
  return new ComfyRequestError('http', url, {
    reasonCode,
    params: { status, statusText },
    status,
    body,
    message: `HTTP ${String(status)} ${statusText}`,
  });
}

/** 応答本文を JSON として読む。読めなければ null（エラー本文は形が保証されないため） */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** GET して本文を JSON で返す。空の本文は null */
export function fetchJson(url: string, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'GET' });
}

/** 値を JSON にして POST し、応答の本文を JSON で返す */
export function postJson(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', body });
}

/**
 * 結果の画像・メモなど JSON でない本文を取るときの上限（本文を読み終えるまで）
 */
const BODY_TIMEOUT_MS = 10_000;

/** JSON でない本文を取る。打ち切りは本文を読み終えるまでを数える */
async function fetchBody<T>(
  url: string,
  options: RequestOptions,
  read: (response: Response) => Promise<T>,
  failed: 'http' | 'fetch-failed',
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? BODY_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    timeoutMs,
  );
  const onExternalAbort = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const init: RequestInit = { method: 'GET', signal: controller.signal };
  if (options.cache !== undefined) init.cache = options.cache;
  try {
    const response = await fetchImpl(url, init);
    if (!response.ok) throw httpFailure(url, response, null, failed);
    return await read(response);
  } catch (cause) {
    if (cause instanceof ComfyRequestError) throw cause;
    throw sendFailure(url, cause, controller.signal, { signal: options.signal, timeoutMs });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/** 画像などの生データ。JSON ではないので本文はそのまま返す */
export function fetchBytes(url: string, options: RequestOptions = {}): Promise<ArrayBuffer> {
  return fetchBody(url, options, (response) => response.arrayBuffer(), 'fetch-failed');
}

/**
 * 生データと、そのファイルの更新時刻（`Last-Modified`。epoch ミリ秒、秒より細かくは無い）。
 * 見出しが無い・読めなければ null（`Last-Modified` は CORS でも読める見出し）
 */
export function fetchBytesStamped(
  url: string,
  options: RequestOptions = {},
): Promise<{ readonly bytes: ArrayBuffer; readonly modifiedAt: number | null }> {
  return fetchBody(
    url,
    options,
    async (response) => {
      const modifiedAt = Date.parse(response.headers.get('Last-Modified') ?? '');
      return {
        bytes: await response.arrayBuffer(),
        modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : null,
      };
    },
    'fetch-failed',
  );
}

/** 本文を文字列で取る（CSV など JSON でないファイル）。無ければ空文字ではなく失敗を返す */
export function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  return fetchBody(url, options, (response) => response.text(), 'http');
}

/** multipart で送る（`/upload/image`）。応答は JSON */
export function postForm(
  url: string,
  form: FormData,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', form });
}

/**
 * 本文を**そのまま**送る（`/userdata` はファイルの中身を生で受け取る）。
 * `postJson` は渡した値を JSON 化するので、整形済みの本文には使えない。
 */
export function postText(
  url: string,
  text: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', rawBody: text });
}

/** 生データをそのまま送る（`/userdata` に画像を書く） */
export function postBlob(url: string, blob: Blob, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'POST', blob });
}

/**
 * 消す（`DELETE /userdata`）。KisaraUI の控えの下だけで使う
 */
export function deleteRequest(url: string, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'DELETE' });
}
