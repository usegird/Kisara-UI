import { describe, expect, it, vi } from 'vitest';

import { serveGateway } from '@/llm/gateway-frame';
import { CONNECT_TYPE, KEY_TYPE, VERIFIED_TYPE, type GatewayMessage } from '@/llm/gateway-protocol';
import type { LlmPort } from '@/port/llm-port';

import { fakeLlmPort } from '../helpers/llm';

const APP = 'https://app.example';
const GATEWAY = 'https://gateway.example';
const BASE = 'https://openrouter.ai/api/v1';

function setup(storage = new Map<string, string>()) {
  let listener: ((event: MessageEvent) => void) | null = null;
  const parent = {};
  const keyOf: { current: (base: string) => string } = { current: () => '' };
  const port: LlmPort = fakeLlmPort(['m']);
  const listModels = vi.spyOn(port, 'listModels');
  serveGateway({
    appOrigin: APP,
    gatewayOrigin: GATEWAY,
    target: { addEventListener: (_type, next) => (listener = next), parent },
    createClient: (lookup) => {
      keyOf.current = lookup;
      return port;
    },
    storage: {
      getItem: (name) => storage.get(name) ?? null,
      setItem: (name, value) => storage.set(name, value),
    },
  });
  const dispatch = (init: { origin: string; source: unknown; data: unknown; ports?: unknown[] }) =>
    listener?.({ ports: [], ...init } as unknown as MessageEvent);
  const received: GatewayMessage[] = [];
  const connect = (origin = APP, source: unknown = parent) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => received.push(event.data as GatewayMessage);
    dispatch({ origin, source, data: { type: CONNECT_TYPE }, ports: [channel.port2] });
    return channel.port1;
  };
  const putKey = (origin: string, key = 'sk-1', source: unknown = {}) =>
    dispatch({ origin, source, data: { type: KEY_TYPE, baseUrl: `${BASE}/`, key } });
  return { connect, putKey, received, keyOf, listModels, storage };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('本体とつなぐ', () => {
  it('本体のオリジンの親からだけつなぎ、キーのある接続先を返す', async () => {
    const gateway = setup();
    gateway.connect('https://evil.example');
    gateway.connect(APP, {});
    await settle();
    expect(gateway.received).toEqual([]);
    gateway.connect();
    await vi.waitFor(() => expect(gateway.received).toEqual([{ type: 'keys', urls: [] }]));
  });
});

describe('キーを受ける', () => {
  it('ゲートウェイのオリジン（入力の窓）からだけ受け、整えたベース URL に結び付ける', async () => {
    const gateway = setup();
    gateway.connect();
    gateway.putKey(APP, 'from-app');
    gateway.putKey(GATEWAY);
    expect(gateway.keyOf.current(BASE)).toBe('sk-1');
    await vi.waitFor(() =>
      expect(gateway.received.slice(-2)).toEqual([
        { type: 'keys', urls: [BASE] },
        { type: 'keySet', url: BASE },
      ]),
    );
  });

  it('キーをタブごとの置き場に書き、読み込み直したら戻して本体へ知らせる', async () => {
    const first = setup();
    first.putKey(GATEWAY);
    const again = setup(first.storage);
    expect(again.keyOf.current(BASE)).toBe('sk-1');
    again.connect();
    await vi.waitFor(() => expect(again.received).toEqual([{ type: 'keys', urls: [BASE] }]));
  });

  it('置き場の形が合わなければ、キーは無いものとして始める', () => {
    const broken = new Map([['kisaraui.gateway.keys', '{"not-a-url": 1']]);
    expect(setup(broken).keyOf.current(BASE)).toBe('');
    const wrong = new Map([['kisaraui.gateway.keys', JSON.stringify({ [BASE]: 3, x: 'k' })]]);
    expect(setup(wrong).keyOf.current(BASE)).toBe('');
  });

  it('本体が返した確かめの結果を、そのキーを送ってきた窓へだけ返す', async () => {
    const gateway = setup();
    const host = gateway.connect();
    const entry = { postMessage: vi.fn() };
    gateway.putKey(GATEWAY, 'sk-1', entry);
    host.postMessage({ type: 'verified', baseUrl: 'https://other.example/v1', outcome: 'ok' });
    host.postMessage({ type: 'verified', baseUrl: `${BASE}/`, outcome: 'auth' });
    await vi.waitFor(() => expect(entry.postMessage).toHaveBeenCalledTimes(1));
    expect(entry.postMessage).toHaveBeenCalledWith(
      { type: VERIFIED_TYPE, outcome: 'auth' },
      GATEWAY,
    );
  });
});

describe('キーを外す', () => {
  it('本体が求めたベース URL のキーを外し、置き場から消して一覧を送り直す', async () => {
    const gateway = setup();
    const host = gateway.connect();
    gateway.putKey(GATEWAY);
    host.postMessage({ type: 'forget', baseUrl: 'https://other.example/v1' });
    host.postMessage({ type: 'forget', baseUrl: `${BASE}/` });
    await vi.waitFor(() => expect(gateway.received.at(-1)).toEqual({ type: 'keys', urls: [] }));
    expect(gateway.keyOf.current(BASE)).toBe('');
    expect(setup(gateway.storage).keyOf.current(BASE)).toBe('');
    expect(gateway.received.filter((message) => message.type === 'keys')).toHaveLength(3);
  });
});

describe('要求を受ける', () => {
  it('キーを入れた接続先への要求だけを送り、ほかは送らずに認証の失敗を返す', async () => {
    const gateway = setup();
    const host = gateway.connect();
    host.postMessage({ type: 'request', id: 1, op: 'listModels', baseUrl: BASE });
    await vi.waitFor(() =>
      expect(gateway.received.at(-1)).toMatchObject({
        id: 1,
        result: { failure: { kind: 'auth' } },
      }),
    );
    expect(gateway.listModels).not.toHaveBeenCalled();

    gateway.putKey(GATEWAY);
    host.postMessage({ type: 'request', id: 2, op: 'listModels', baseUrl: BASE });
    await vi.waitFor(() =>
      expect(gateway.received.at(-1)).toMatchObject({
        type: 'result',
        id: 2,
        result: { ok: true },
      }),
    );
    expect(gateway.listModels).toHaveBeenCalledTimes(1);
  });

  it('形の合わない要求は黙って捨てる', async () => {
    const gateway = setup();
    gateway.putKey(GATEWAY);
    const host = gateway.connect();
    host.postMessage({ type: 'request', id: 3, op: 'streamChat', baseUrl: BASE, request: {} });
    host.postMessage({ type: 'request', id: 4, op: 'fetch', baseUrl: BASE });
    host.postMessage({ type: 'request', id: 5, op: 'checkKey', baseUrl: BASE });
    const results = () => gateway.received.filter((message) => message.type === 'result');
    await vi.waitFor(() => expect(results()).toHaveLength(1));
    expect(results()[0]).toMatchObject({ id: 5 });
  });
});
