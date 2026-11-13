import { describe, expect, it, vi } from 'vitest';

import { createLlmClient, type FetchLike } from '@/llm/client';
import { REPLY_MAX_CHARS, TOOL_CALL_LIMIT } from '@/llm/client-receive';
import type { ChatCompletionRequest, ChatStreamEvent } from '@/port/llm-port';

import { deltaLine, sseResponse } from '../helpers/llm';

// ─────────────────────────────
// LLM の HTTP 呼び出し。作り物の fetch に答えさせ、本物には送らない。
// ─────────────────────────────

const ENDPOINT = { baseUrl: 'http://127.0.0.1:11434/v1/' };
const REQUEST: ChatCompletionRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
  stream_options: { include_usage: true },
};

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function client(
  answer: (call: Call) => Promise<Response> | Response,
  page = 'http:',
  keys: Readonly<Record<string, string>> = {},
) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return answer({ url, init });
  };
  const keyOf = (base: string) => keys[base] ?? '';
  return { calls, port: createLlmClient({ fetch, pageProtocol: () => page, keyOf }) };
}

async function collect(
  port: ReturnType<typeof client>['port'],
  signal: AbortSignal = new AbortController().signal,
) {
  const events: ChatStreamEvent[] = [];
  const result = await port.streamChat(ENDPOINT, REQUEST, {
    onEvent: (event) => events.push(event),
    signal,
  });
  return { events, result };
}

describe('モデルの一覧', () => {
  it('ベース URL の後ろに /models を付け、data[].id を返す', async () => {
    const { calls, port } = client(() => Response.json({ data: [{ id: 'a' }, { id: 'b' }, {}] }));
    const result = await port.listModels(ENDPOINT);
    expect(calls[0]?.url).toBe('http://127.0.0.1:11434/v1/models');
    expect(result).toEqual({
      ok: true,
      value: { ids: ['a', 'b'], contexts: {}, details: {}, serverContext: null, truncated: false },
    });
    // llama.cpp でなければ /props は読まない
    expect(calls).toHaveLength(1);
  });

  it('上限の件数を超えた分は捨て、捨てたことを返す', async () => {
    const data = Array.from({ length: 10_005 }, (_, index) => ({ id: `m${String(index)}` }));
    const { port } = client(() => Response.json({ data }));
    const result = await port.listModels(ENDPOINT);
    expect(result.ok && result.value.ids.length).toBe(10_000);
    expect(result.ok && result.value.truncated).toBe(true);
  });

  it('応答が決めた時間のうちに来なければ、時間切れとする', async () => {
    vi.useFakeTimers();
    try {
      const { port } = client(
        ({ init }) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('x', 'AbortError')),
            );
          }),
      );
      const pending = port.listModels(ENDPOINT);
      await vi.advanceTimersByTimeAsync(10_001);
      expect(await pending).toMatchObject({ failure: { kind: 'timeout' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('項目の文脈長を読む（context_length・max_model_len・meta.n_ctx_train）', async () => {
    const data = [
      { id: 'a', context_length: 128000 },
      { id: 'b', max_model_len: 32768 },
      { id: 'c', meta: { n_ctx_train: 8192 } },
      { id: 'd', context_length: 0 },
    ];
    const { port } = client(() => Response.json({ data }));
    const result = await port.listModels(ENDPOINT);
    expect(result.ok && result.value.contexts).toEqual({ a: 128000, b: 32768, c: 8192 });
  });

  it('llama.cpp なら根の /props から起動時の文脈長を読む。読めなくても一覧は返す', async () => {
    const llama = { data: [{ id: 'q', owned_by: 'llamacpp', meta: { n_ctx_train: 131072 } }] };
    const { calls, port } = client(({ url }) =>
      url.endsWith('/props')
        ? Response.json({ default_generation_settings: { n_ctx: 4096 } })
        : Response.json(llama),
    );
    const result = await port.listModels(ENDPOINT);
    expect(calls[1]?.url).toBe('http://127.0.0.1:11434/props');
    expect(result.ok && result.value.serverContext).toBe(4096);

    const failing = client(({ url }) =>
      url.endsWith('/props') ? new Response(null, { status: 404 }) : Response.json(llama),
    );
    const fallback = await failing.port.listModels(ENDPOINT);
    expect(fallback.ok && fallback.value).toMatchObject({ ids: ['q'], serverContext: null });
  });

  it('整えたベース URL にキーがあるときだけ Authorization を付ける', async () => {
    const keys = { 'http://127.0.0.1:11434/v1': 'k' };
    const { calls, port } = client(() => Response.json({ data: [] }), 'http:', keys);
    await port.listModels({ baseUrl: 'http://127.0.0.1:8080/v1' });
    await port.listModels(ENDPOINT);
    const headers = calls.map(
      (call) => (call.init.headers as Record<string, string>).Authorization,
    );
    expect(headers).toEqual([undefined, 'Bearer k']);
  });

  it('状態番号から原因を分け、応答の error.message を添える', async () => {
    const { port } = client(() =>
      Response.json({ error: { message: 'bad key' } }, { status: 401 }),
    );
    expect(await port.listModels(ENDPOINT)).toEqual({
      ok: false,
      failure: { kind: 'auth', status: 401, message: 'bad key' },
    });
  });

  it('要求そのものが失敗したら届かないとする', async () => {
    const { port } = client(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await port.listModels(ENDPOINT)).toMatchObject({ failure: { kind: 'unreachable' } });
  });

  it('届かなかったら中身を読まない要求で確かめ、届けば CORS、届かなければ応答なしとする', async () => {
    const { calls, port } = client(
      ({ init }) =>
        init.mode === 'no-cors'
          ? new Response(null, { status: 200 })
          : Promise.reject(new TypeError('Failed to fetch')),
      'http:',
      { 'http://127.0.0.1:11434/v1': 'secret' },
    );
    const result = await port.listModels(ENDPOINT);
    expect(result).toMatchObject({ failure: { kind: 'cors' } });
    // 確かめる要求は同じ宛先へ、キーを付けずに送る
    expect(calls[1]?.url).toBe('http://127.0.0.1:11434/v1/models');
    expect(calls[1]?.init.headers).toBeUndefined();
  });

  it('https のページから手元以外の http へは送らずに経路の食い違いとする', async () => {
    const { calls, port } = client(() => Response.json({ data: [] }), 'https:');
    const result = await port.listModels({ ...ENDPOINT, baseUrl: 'http://192.168.0.5:8000/v1' });
    expect(result).toMatchObject({ failure: { kind: 'mixed-content' } });
    expect(calls).toHaveLength(0);
    // 手元（ループバック）は通る
    await port.listModels(ENDPOINT);
    expect(calls).toHaveLength(1);
  });
});
describe('受け取った本文の控え', () => {
  it('ストリーミングは空でない行を、1 つの JSON は全文を、そのまま渡す', async () => {
    const lines: string[] = [];
    const signal = new AbortController().signal;
    const streamed = client(() => sseResponse([': ping\n', deltaLine('Hi'), 'data: [DONE]\n\n']));
    await streamed.port.streamChat(ENDPOINT, REQUEST, {
      onEvent: () => {},
      signal,
      onRaw: (line) => lines.push(line),
    });
    expect(lines).toEqual([': ping', deltaLine('Hi').trim(), 'data: [DONE]']);

    const texts: string[] = [];
    const json = { choices: [{ message: { content: 'Hi' } }] };
    const whole = client(() => Response.json(json));
    const result = await whole.port.streamChat(ENDPOINT, REQUEST, {
      onEvent: () => {},
      signal,
      onRaw: (text) => texts.push(text),
    });
    expect(texts).toEqual([JSON.stringify(json)]);
    expect(result.ok).toBe(true);
  });
});

describe('API キーの確かめ', () => {
  it('ベース URL の後ろの /key にキーを付けて送り、断られたら認証の失敗とする', async () => {
    const cloud = { baseUrl: 'https://openrouter.ai/api/v1' };
    const keys = { [cloud.baseUrl]: 'sk-or-1' };
    const ok = client(() => Response.json({ data: {} }), 'http:', keys);
    expect(await ok.port.checkKey(cloud)).toEqual({ ok: true, value: null });
    expect(ok.calls[0]?.url).toBe('https://openrouter.ai/api/v1/key');
    expect((ok.calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-or-1',
    );

    const denied = client(() => Response.json({ error: { message: 'no' } }, { status: 401 }));
    expect(await denied.port.checkKey(cloud)).toMatchObject({ failure: { kind: 'auth' } });
  });
});

describe('Chat Completions の受け取り', () => {
  it('SSE の delta を順に渡し、[DONE] で終える', async () => {
    const { calls, port } = client(() =>
      sseResponse([
        deltaLine('He'),
        `${deltaLine('llo').trimEnd()}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    const { events, result } = await collect(port);
    expect(calls[0]?.url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(
      JSON.parse(typeof calls[0]?.init.body === 'string' ? calls[0].init.body : '{}'),
    ).toMatchObject({ stream: true, model: 'm' });
    expect(result.ok).toBe(true);
    expect(events).toEqual([
      { kind: 'delta', content: 'He', reasoning: '' },
      { kind: 'delta', content: 'llo', reasoning: '' },
      { kind: 'finish', reason: 'stop' },
    ]);
  });

  it('OpenRouter の処理中の注釈の行だけを processing として渡す（ほかの注釈は渡さない）', async () => {
    const { port } = client(() =>
      sseResponse([
        ': OPENROUTER PROCESSING\n\n',
        ': ping\n\n',
        deltaLine('Hi'),
        'data: [DONE]\n\n',
      ]),
    );
    const { events, result } = await collect(port);
    expect(result.ok).toBe(true);
    expect(events.map((event) => event.kind)).toEqual(['processing', 'delta']);
  });

  it('思考の本文は reasoning_content からも reasoning からも読む', async () => {
    const { port } = client(() =>
      sseResponse([
        deltaLine('', { reasoning_content: 'a' }),
        deltaLine('', { reasoning: 'b' }),
        'data: [DONE]\n\n',
      ]),
    );
    const { events } = await collect(port);
    expect(events.map((event) => (event.kind === 'delta' ? event.reasoning : ''))).toEqual([
      'a',
      'b',
    ]);
  });

  it('ストリーミングに応じず 1 つの JSON で返すサーバーも読む', async () => {
    const { port } = client(() =>
      Response.json({
        choices: [{ message: { content: 'whole' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    );
    const { events, result } = await collect(port);
    expect(result.ok).toBe(true);
    expect(events).toContainEqual({ kind: 'usage', usage: { prompt: 3, completion: 1 } });
    expect(events[0]).toEqual({ kind: 'delta', content: 'whole', reasoning: '', whole: true });
  });

  it('キャッシュの読み・書きを読む。返さなかった方は持たない', async () => {
    const usageFrom = async (usage: Record<string, unknown>) => {
      const { port } = client(() =>
        Response.json({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], usage }),
      );
      const { events } = await collect(port);
      return events.find((event) => event.kind === 'usage');
    };
    const base = { prompt_tokens: 100, completion_tokens: 5 };
    expect(
      await usageFrom({
        ...base,
        prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 15 },
      }),
    ).toMatchObject({ usage: { cacheRead: 80, cacheWrite: 15 } });
    const readOnly = await usageFrom({ ...base, prompt_cache_hit_tokens: 60 });
    expect(readOnly).toMatchObject({ usage: { cacheRead: 60 } });
    expect(readOnly).not.toHaveProperty('usage.cacheWrite');
    const writeOnly = await usageFrom({
      ...base,
      prompt_tokens_details: { cache_write_tokens: 40 },
    });
    expect(writeOnly).toMatchObject({ usage: { cacheWrite: 40 } });
    expect(writeOnly).not.toHaveProperty('usage.cacheRead');
    expect(await usageFrom(base)).not.toHaveProperty('usage.cacheRead');
  });

  it('本文が 1 文字も届かなければ、読めない応答とする', async () => {
    const { port } = client(() => sseResponse(['data: [DONE]\n\n']));
    expect((await collect(port)).result).toMatchObject({ failure: { kind: 'bad-response' } });
  });

  it('ストリームの途中で届いた失敗は、その文で断られたとする', async () => {
    const { port } = client(() =>
      sseResponse([deltaLine('x'), 'data: {"error":{"message":"context too long"}}\n\n']),
    );
    expect((await collect(port)).result).toEqual({
      ok: false,
      failure: { kind: 'rejected', message: 'context too long' },
    });
  });

  it('止めたら、本文の読み取りを止めない実装でも待たずに止めたとして返す', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    // 終わらないストリーム（止めた合図を見ない）
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(encoder.encode(deltaLine('part')));
      },
    });
    const { port } = client(
      () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const events: ChatStreamEvent[] = [];
    const pending = port.streamChat(ENDPOINT, REQUEST, {
      onEvent: (event) => {
        events.push(event);
        controller.abort();
      },
      signal: controller.signal,
    });
    expect(await pending).toMatchObject({ failure: { kind: 'stopped' } });
    expect(events).toHaveLength(1);
  });

  it('呼び出しの番号は受け取った順に詰め、同じ番号の続きは同じ位置に足す', async () => {
    const call = (index: number, args: string): string =>
      `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index, function: { arguments: args } }] } }],
      })}\n\n`;
    const { port } = client(() =>
      sseResponse([call(1000000000, 'a'), call(-3, 'b'), call(1000000000, 'c')]),
    );
    const { events } = await collect(port);
    const indexes = events.flatMap((event) => (event.kind === 'tool-call' ? [event.index] : []));
    expect(indexes).toEqual([0, 1, 0]);
  });

  it('呼び出しが上限の件数を超えたら、それ以降の新しい呼び出しは飛ばす', async () => {
    const lines = Array.from(
      { length: TOOL_CALL_LIMIT + 2 },
      (_, index) =>
        `data: ${JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index, function: { name: 'f' } }] } }],
        })}\n\n`,
    );
    const { events } = await collect(client(() => sseResponse(lines)).port);
    expect(events.filter((event) => event.kind === 'tool-call')).toHaveLength(TOOL_CALL_LIMIT);
  });

  it('改行の無い 1 行が上限を超えたら、大きすぎる応答として止める', async () => {
    const { port } = client(() =>
      sseResponse([deltaLine('a'), 'data: '.padEnd(1024 * 1024 + 10, 'x')]),
    );
    const { events, result } = await collect(port);
    expect(result).toMatchObject({ failure: { kind: 'response-too-large' } });
    expect(events).toHaveLength(1);
  });

  it('返事の本文の合計が上限を超えたら、そこで止める（受け取った分は渡してある）', async () => {
    const piece = 'x'.repeat(1024 * 1024 - 100);
    const lines = Array.from({ length: 9 }, () => deltaLine(piece));
    const { events, result } = await collect(client(() => sseResponse(lines)).port);
    expect(result).toMatchObject({ failure: { kind: 'response-too-large' } });
    expect(events.length).toBe(Math.floor(REPLY_MAX_CHARS / piece.length));
  });

  it('途中で決めた時間のうちに次が届かなければ、時間切れとして止める', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(deltaLine('part')));
        },
      });
      const { port } = client(
        () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      );
      const pending = collect(port);
      await vi.advanceTimersByTimeAsync(31_000);
      const { events, result } = await pending;
      expect(result).toMatchObject({ failure: { kind: 'timeout' } });
      expect(events).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('呼び出しが届いた後は、引数をまとめて送るサーバーを待つため 5 分まで待つ', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      const named = `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'f' } }] } }],
      })}\n\n`;
      const args = `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }],
      })}\n\ndata: [DONE]\n\n`;
      let push: (text: string) => void = () => undefined;
      let close: () => void = () => undefined;
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode(named));
          push = (text) => stream.enqueue(encoder.encode(text));
          close = () => stream.close();
        },
      });
      const { port } = client(
        () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      );
      const pending = collect(port);
      await vi.advanceTimersByTimeAsync(120_000);
      push(args);
      close();
      const { events, result } = await pending;
      expect(result.ok).toBe(true);
      expect(events.filter((event) => event.kind === 'tool-call')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('送る前に止めたら、止めたとして返す', async () => {
    const controller = new AbortController();
    const { port } = client(({ init }) => {
      controller.abort();
      return init.signal?.aborted === true
        ? Promise.reject(new DOMException('aborted', 'AbortError'))
        : sseResponse([]);
    });
    expect((await collect(port, controller.signal)).result).toMatchObject({
      failure: { kind: 'stopped' },
    });
  });
});
