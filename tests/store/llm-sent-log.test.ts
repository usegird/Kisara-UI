import { afterEach, describe, expect, it } from 'vitest';

import type { ChatCompletionRequest } from '@/port/llm-port';
import { recordSentLlmPort, tagSentRequest } from '@/store/ports/llm-sent-log';
import {
  keptBody,
  RECEIVED_KEEP,
  RECEIVED_LIMIT,
  useReceivedStore,
} from '@/store/use-received-store';
import { useSentRequestsStore } from '@/store/use-sent-requests-store';

import { fakeLlmPort } from '../helpers/llm';

// ─────────────────────────────
// 送った要求の本文の記録（発言の送った中身のアイコンで見る）。候補の鍵を添えた要求だけを、
// 送る本文と同じ JSON で候補ごとの最新として残す。一覧の取得とキーの確認は記録しない
// ─────────────────────────────

afterEach(() => {
  useSentRequestsStore.setState({ byKey: {} });
  useReceivedStore.setState({ byKey: {} });
});

const ENDPOINT = { baseUrl: 'http://llm' };

function request(model: string): ChatCompletionRequest {
  return {
    model,
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    stream_options: { include_usage: true },
  };
}

function send(port: ReturnType<typeof recordSentLlmPort>, model: string, key?: string): void {
  const body = request(model);
  if (key !== undefined) tagSentRequest(body, key);
  void port.streamChat(ENDPOINT, body, { onEvent: () => {}, signal: new AbortController().signal });
}

describe('送った要求の本文の記録', () => {
  it('鍵を添えた要求を、送る本文のまま候補ごとの最新として残し、窓口へ渡す', () => {
    const inner = fakeLlmPort();
    const port = recordSentLlmPort(inner);
    send(port, 'first', 'c1/a1/0');
    send(port, 'retry', 'c1/a1/0');
    send(port, 'other', 'c1/a1/1');
    const { byKey } = useSentRequestsStore.getState();
    expect(byKey['c1/a1/0']?.body).toBe(JSON.stringify(request('retry')));
    expect(byKey['c1/a1/1']?.model).toBe('other');
    expect(inner.requests).toHaveLength(3);
  });
  it('鍵を添えた要求の受け取った本文を、受け取り終えたときに 1 度だけ残す', async () => {
    const inner = fakeLlmPort();
    const port = recordSentLlmPort({
      ...inner,
      streamChat: (endpoint, body, { onEvent, signal, onRaw }) => {
        onRaw?.('data: a');
        expect(useReceivedStore.getState().byKey['c1/a1/0']).toBeUndefined();
        onRaw?.('data: b');
        return inner.streamChat(endpoint, body, { onEvent, signal });
      },
    });
    const body = request('m');
    tagSentRequest(body, 'c1/a1/0');
    const pending = port.streamChat(ENDPOINT, body, {
      onEvent: () => {},
      signal: new AbortController().signal,
    });
    inner.finish();
    await pending;
    expect(useReceivedStore.getState().byKey['c1/a1/0']?.text).toBe('data: a\ndata: b');
  });

  it('大きすぎる本文は先頭と末尾だけを残す', () => {
    const text = 'x'.repeat(RECEIVED_LIMIT + 10);
    const kept = keptBody(text);
    expect(kept.truncated).toBe(true);
    expect(kept.text.length).toBeLessThan(RECEIVED_KEEP * 2 + 10);
    expect(keptBody('short')).toEqual({ text: 'short', truncated: false });
  });

  it('鍵の無い要求・一覧の取得・キーの確認は記録しない', async () => {
    const inner = fakeLlmPort();
    const port = recordSentLlmPort(inner);
    send(port, 'summary');
    await port.listModels(ENDPOINT);
    await port.checkKey(ENDPOINT);
    expect(useSentRequestsStore.getState().byKey).toEqual({});
    expect(inner.requests).toHaveLength(1);
  });
});
