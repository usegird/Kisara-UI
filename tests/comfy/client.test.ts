import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComfyRequestError, fetchBytes, fetchJson, postJson, type FetchLike } from '@/comfy/client';

const URL_UNDER_TEST = 'http://127.0.0.1:8188/object_info';

function jsonResponse(body: string, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HTTP クライアント', () => {
  it('JSON を返す', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse('{"ok":true}'));

    await expect(fetchJson(URL_UNDER_TEST, { fetchImpl })).resolves.toEqual({ ok: true });
  });

  it('空応答は null にする', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse(''));

    await expect(fetchJson(URL_UNDER_TEST, { fetchImpl })).resolves.toBeNull();
  });

  it('POST は JSON 本文と Content-Type を送る', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse('{}')));

    await postJson(URL_UNDER_TEST, { prompt: 1 }, { fetchImpl });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"prompt":1}');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('HTTP エラーは状態つきで返す', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(jsonResponse('nope', { status: 404, statusText: 'Not Found' }));

    const error = await fetchJson(URL_UNDER_TEST, { fetchImpl }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ComfyRequestError);
    expect((error as ComfyRequestError).kind).toBe('http');
    expect((error as ComfyRequestError).status).toBe(404);
    expect(error).toMatchObject({
      reasonCode: 'http',
      params: { status: 404, statusText: 'Not Found' },
      message: 'HTTP 404 Not Found',
    });
  });

  it('JSON でない本文の取得の HTTP エラーは fetch-failed にする', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(new Response('', { status: 500 }));

    const error = await fetchBytes(URL_UNDER_TEST, { fetchImpl }).catch((e: unknown) => e);
    expect(error).toMatchObject({
      kind: 'http',
      reasonCode: 'fetch-failed',
      params: { status: 500 },
    });
  });

  it('JSON にならない応答は parse エラーにする', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse('<html>'));

    const error = await fetchJson(URL_UNDER_TEST, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ComfyRequestError).kind).toBe('parse');
    expect((error as ComfyRequestError).reasonCode).toBe('parse');
  });

  it('到達できない場合は unreachable にする（CORS/LNA と区別できない）', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));

    const error = await fetchJson(URL_UNDER_TEST, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ComfyRequestError).kind).toBe('unreachable');
    expect((error as ComfyRequestError).reasonCode).toBe('unreachable');
    expect((error as ComfyRequestError).url).toBe(URL_UNDER_TEST);
  });

  it('時間切れは timeout にする', async () => {
    vi.useFakeTimers();
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const promise = fetchJson(URL_UNDER_TEST, { fetchImpl, timeoutMs: 1000 }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(1001);

    expect(await promise).toMatchObject({
      kind: 'timeout',
      reasonCode: 'timeout',
      params: { ms: 1000 },
    });
  });

  it('外部からの中断は aborted にする', async () => {
    const controller = new AbortController();
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const promise = fetchJson(URL_UNDER_TEST, { fetchImpl, signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    controller.abort();

    expect(await promise).toMatchObject({ kind: 'aborted', reasonCode: 'aborted' });
  });
});
