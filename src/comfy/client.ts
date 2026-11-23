import { ComfyRequestError, type RequestOptions } from '@/comfy/request-error';

export { ComfyRequestError, type FetchLike, type RequestOptions } from '@/comfy/request-error';

const DEFAULT_TIMEOUT_MS = 30_000;

interface SendOptions extends RequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly form?: FormData;
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
    throw sendFailure(url, cause, controller.signal, { signal: options.signal, timeoutMs });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) {
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

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function fetchJson(url: string, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'GET' });
}

export function postJson(
  url: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', body });
}

const BODY_TIMEOUT_MS = 10_000;

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

export function fetchBytes(url: string, options: RequestOptions = {}): Promise<ArrayBuffer> {
  return fetchBody(url, options, (response) => response.arrayBuffer(), 'fetch-failed');
}

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

export function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  return fetchBody(url, options, (response) => response.text(), 'http');
}

export function postForm(
  url: string,
  form: FormData,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', form });
}

export function postText(
  url: string,
  text: string,
  options: RequestOptions = {},
): Promise<unknown> {
  return send(url, { ...options, method: 'POST', rawBody: text });
}

export function postBlob(url: string, blob: Blob, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'POST', blob });
}

export function deleteRequest(url: string, options: RequestOptions = {}): Promise<unknown> {
  return send(url, { ...options, method: 'DELETE' });
}
