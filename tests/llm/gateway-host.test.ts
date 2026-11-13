// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGatewayHost } from '@/llm/gateway-host';
import type { HostMessage } from '@/llm/gateway-protocol';
import type { ChatCompletionRequest, ChatStreamEvent } from '@/port/llm-port';

import { fakeLlmPort } from '../helpers/llm';

// ─────────────────────────────
// 本体の側。ゲートウェイがキーを持つ接続先への要求だけをゲートウェイへ回し、ほかは直に送る。
// ─────────────────────────────

const GATEWAY = 'https://gateway.example';
const BASE = 'https://openrouter.ai/api/v1';
const LOCAL = 'http://127.0.0.1:11434/v1';
const REQUEST: ChatCompletionRequest = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
  stream_options: { include_usage: true },
};

afterEach(() => {
  document.body.replaceChildren();
});

/** 本体の側を作り、iframe の読み込みを起こして、ゲートウェイの側の通り道を取る */
function setup() {
  const direct = fakeLlmPort(['direct']);
  const open = vi.fn((): unknown => ({}));
  const host = createGatewayHost({
    gatewayOrigin: GATEWAY,
    direct,
    document,
    open,
    locale: () => 'ja',
  });
  const frame = document.querySelector('iframe') as HTMLIFrameElement;
  let gatewaySide: MessagePort | null = null;
  const sent: HostMessage[] = [];
  vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(
    (_message: unknown, _origin: unknown, transfer?: unknown) => {
      gatewaySide = (transfer as MessagePort[])[0] ?? null;
      gatewaySide?.addEventListener('message', (event) => sent.push(event.data as HostMessage));
      gatewaySide?.start();
    },
  );
  frame.dispatchEvent(new Event('load'));
  const reply = (message: unknown) => gatewaySide?.postMessage(message);
  return { host, frame, direct, open, sent, reply };
}

describe('ゲートウェイの iframe', () => {
  it('ゲートウェイのページを見えない iframe で置く', () => {
    const { frame } = setup();
    expect(frame.src).toBe(`${GATEWAY}/gateway.html`);
    expect(frame.hidden).toBe(true);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('要求の振り分け', () => {
  it('つながるまではどれも直に送り、入力の窓も開かない', async () => {
    const { host, sent, open } = setup();
    const result = await host.llm.listModels({ baseUrl: BASE });
    expect(result.ok && result.value.ids).toEqual(['direct']);
    expect(host.keys.openEntry(BASE)).toBe('unready');
    expect(open).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('キーのある接続先だけをゲートウェイへ回し、知らせを受けたら購読者に知らせる', async () => {
    const { host, sent, reply } = setup();
    const listener = vi.fn();
    host.keys.subscribe(listener);
    reply({ type: 'keys', urls: [BASE] });
    await vi.waitFor(() => expect(host.keys.keyedUrls()).toEqual([BASE]));
    expect(listener).toHaveBeenCalledTimes(1);

    const local = await host.llm.listModels({ baseUrl: LOCAL });
    expect(local.ok && local.value.ids).toEqual(['direct']);

    const pending = host.llm.checkKey({ baseUrl: `${BASE}/` });
    await vi.waitFor(() =>
      expect(sent).toEqual([{ type: 'request', id: 1, op: 'checkKey', baseUrl: `${BASE}/` }]),
    );
    reply({ type: 'result', id: 1, result: { ok: true, value: null } });
    expect(await pending).toEqual({ ok: true, value: null });
  });

  it('キーが入った知らせを購読者に渡し、確かめた結果をゲートウェイへ返す', async () => {
    const { host, sent, reply } = setup();
    const onKeySet = vi.fn();
    host.keys.onKeySet(onKeySet);
    reply({ type: 'keySet', url: BASE });
    await vi.waitFor(() => expect(onKeySet).toHaveBeenCalledWith(BASE));
    host.keys.reportVerified(BASE, 'auth');
    await vi.waitFor(() =>
      expect(sent).toEqual([{ type: 'verified', baseUrl: BASE, outcome: 'auth' }]),
    );
  });

  it('生成は届いたものを渡し、止めたらゲートウェイに止める知らせを送る', async () => {
    const { host, sent, reply } = setup();
    reply({ type: 'keys', urls: [BASE] });
    await vi.waitFor(() => expect(host.keys.keyedUrls()).toEqual([BASE]));
    const events: ChatStreamEvent[] = [];
    const raws: string[] = [];
    const controller = new AbortController();
    const pending = host.llm.streamChat({ baseUrl: BASE }, REQUEST, {
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      onRaw: (text) => raws.push(text),
    });
    await vi.waitFor(() =>
      expect(sent[0]).toMatchObject({ op: 'streamChat', raw: true, request: { model: 'm' } }),
    );
    reply({ type: 'event', id: 1, event: { kind: 'delta', content: 'Hi', reasoning: '' } });
    reply({ type: 'raw', id: 1, text: 'data: x' });
    controller.abort();
    await vi.waitFor(() => expect(sent.at(-1)).toEqual({ type: 'abort', id: 1 }));
    reply({ type: 'result', id: 1, result: { ok: false, failure: { kind: 'stopped' } } });
    expect(await pending).toEqual({ ok: false, failure: { kind: 'stopped' } });
    expect(events).toEqual([{ kind: 'delta', content: 'Hi', reasoning: '' }]);
    expect(raws).toEqual(['data: x']);
  });
});

describe('入力の窓', () => {
  it('ベース URL と言語を # に入れ、名前を付けずに開く', async () => {
    const { host, open, reply } = setup();
    const ready = new Promise((resolve) => host.keys.subscribe(() => resolve(null)));
    reply({ type: 'keys', urls: [] });
    await ready;
    expect(host.keys.openEntry(` ${BASE} `)).toBe('opened');
    const [url, target] = open.mock.calls[0] as unknown as [string, string];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${GATEWAY}/gateway-entry.html`);
    expect(parsed.search).toBe('');
    expect(new URLSearchParams(parsed.hash.slice(1)).get('base')).toBe(BASE);
    expect(new URLSearchParams(parsed.hash.slice(1)).get('lang')).toBe('ja');
    expect(target).toBe('_blank');
  });

  it('止められて開けなかったら blocked', async () => {
    const { host, open, reply } = setup();
    open.mockReturnValue(null);
    const ready = new Promise((resolve) => host.keys.subscribe(() => resolve(null)));
    reply({ type: 'keys', urls: [] });
    await ready;
    expect(host.keys.openEntry(BASE)).toBe('blocked');
  });
});
