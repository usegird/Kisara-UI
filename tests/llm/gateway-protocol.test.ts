import { describe, expect, it, vi } from 'vitest';

import {
  KEY_TYPE,
  parseHostMessage,
  parseVerifiedMessage,
  postKeyToOpener,
  VERIFIED_TYPE,
} from '@/llm/gateway-protocol';

// ─────────────────────────────
// 本体・ゲートウェイ・入力の窓の間の知らせ。ゲートウェイは本体からの値を確かめてから使う。
// ─────────────────────────────

const BASE = 'https://openrouter.ai/api/v1';

describe('本体からの要求を読む', () => {
  it('決まった 3 つの要求と止める知らせだけを読み、ほかは null', () => {
    expect(parseHostMessage({ type: 'request', id: 1, op: 'checkKey', baseUrl: BASE })).toEqual({
      type: 'request',
      id: 1,
      op: 'checkKey',
      baseUrl: BASE,
    });
    expect(parseHostMessage({ type: 'abort', id: 2 })).toEqual({ type: 'abort', id: 2 });
    expect(parseHostMessage({ type: 'forget', baseUrl: BASE })).toEqual({
      type: 'forget',
      baseUrl: BASE,
    });
    expect(parseHostMessage({ type: 'forget', baseUrl: 1 })).toBeNull();
    expect(parseHostMessage({ type: 'request', id: 3, op: 'other', baseUrl: BASE })).toBeNull();
    expect(parseHostMessage({ type: 'request', op: 'checkKey', baseUrl: BASE })).toBeNull();
  });

  it('生成の本体は、モデル名と発言の並びがありストリーミングで受けるときだけ読む', () => {
    const request = { model: 'm', messages: [], stream: true };
    const message = { type: 'request', id: 1, op: 'streamChat', baseUrl: BASE, request };
    expect(parseHostMessage(message)).toMatchObject({ op: 'streamChat', raw: false });
    expect(parseHostMessage({ ...message, request: { ...request, stream: false } })).toBeNull();
    expect(parseHostMessage({ ...message, request: { messages: [], stream: true } })).toBeNull();
  });
});

describe('確かめた結果を読む', () => {
  it('決まった 3 つの結果だけを読み、ほかは null', () => {
    const verified = { type: 'verified', baseUrl: BASE, outcome: 'ok' };
    expect(parseHostMessage(verified)).toEqual(verified);
    expect(parseHostMessage({ ...verified, outcome: 'maybe' })).toBeNull();
    expect(parseVerifiedMessage({ type: VERIFIED_TYPE, outcome: 'auth' })).toBe('auth');
    expect(parseVerifiedMessage({ type: VERIFIED_TYPE, outcome: 'x' })).toBeNull();
    expect(parseVerifiedMessage({ type: 'other', outcome: 'ok' })).toBeNull();
  });
});

describe('入力の窓からキーを渡す', () => {
  it('開いた窓の中のどの iframe にも、送り先をゲートウェイに限って渡す', () => {
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    const message = { type: KEY_TYPE, baseUrl: BASE, key: 'sk-1' } as const;
    const opener = { frames: { length: 2, 0: first, 1: second } };
    expect(postKeyToOpener(opener, message, 'https://gateway.example')).toBe(true);
    expect(first.postMessage).toHaveBeenCalledWith(message, 'https://gateway.example');
    expect(second.postMessage).toHaveBeenCalledWith(message, 'https://gateway.example');
    expect(postKeyToOpener(null, message, 'https://gateway.example')).toBe(false);
  });
});
