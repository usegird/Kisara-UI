import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatCompletionRequest,
  ChatStreamEvent,
  ChatStreamReceiver,
  LlmPort,
} from '@/port/llm-port';
import { budgetLlmPort, resumeLlmBudget, setBudgetClock } from '@/store/ports/llm-budget';
import { DEFAULT_SAFEGUARDS } from '@/store/settings-fields/safeguards';
import { useLlmBudgetStore } from '@/store/use-llm-budget-store';

// ─────────────────────────────
// 要求の量の歯止め。1 回の上限と、窓の間の入力・出力の閾値。値は防御機構の既定
// ─────────────────────────────

const REQUEST_INPUT_MAX = DEFAULT_SAFEGUARDS.llmRequestInputMax;
const BUDGET_WINDOW_MS = DEFAULT_SAFEGUARDS.llmWindowMinutes * 60_000;
const WINDOW_OUTPUT_LIMIT = DEFAULT_SAFEGUARDS.llmWindowOutputLimit;
const WINDOW_INPUT_LIMIT = DEFAULT_SAFEGUARDS.llmWindowInputLimit;

const ENDPOINT = { baseUrl: 'http://llm' };
let clock = 0;

/** 届けるものを順に流し、止める合図が来たら 'stopped' で終わる作り物 */
function fakePort(events: readonly ChatStreamEvent[]): LlmPort & { sent: number } {
  const port = {
    sent: 0,
    listModels: () => Promise.resolve({ ok: true as const, value: [] }),
    checkKey: () => Promise.resolve({ ok: true as const, value: null }),
    streamChat: (
      _endpoint: unknown,
      _request: unknown,
      { onEvent, signal }: ChatStreamReceiver,
    ) => {
      port.sent += 1;
      for (const event of events) {
        if (signal.aborted) break;
        onEvent(event);
      }
      return Promise.resolve(
        signal.aborted
          ? { ok: false as const, failure: { kind: 'stopped' as const } }
          : { ok: true as const, value: null },
      );
    },
  };
  return port as unknown as LlmPort & { sent: number };
}

function request(text: string): ChatCompletionRequest {
  return {
    model: 'm',
    messages: [{ role: 'user', content: text }],
    stream: true,
    stream_options: { include_usage: true },
  };
}

function send(port: LlmPort, text = 'hi'): ReturnType<LlmPort['streamChat']> {
  return port.streamChat(ENDPOINT, request(text), {
    onEvent: () => undefined,
    signal: new AbortController().signal,
  });
}

const usage = (prompt: number, completion: number): ChatStreamEvent => ({
  kind: 'usage',
  usage: { prompt, completion },
});

setBudgetClock(() => clock);

afterEach(() => {
  clock = 0;
  resumeLlmBudget();
});

describe('要求の量の歯止め', () => {
  it('1 回の送る中身が上限を超えたら送らない', async () => {
    const port = fakePort([]);
    const guarded = budgetLlmPort(port);
    const result = await send(guarded, 'あ'.repeat(REQUEST_INPUT_MAX + 1));
    expect(result).toEqual({ ok: false, failure: { kind: 'too-large' } });
    expect(port.sent).toBe(0);
  });

  it('受け取りの途中で出力が閾値を超えたら止めて確かめ、続けるまで送らない', async () => {
    const big = { kind: 'delta', content: 'あ'.repeat(WINDOW_OUTPUT_LIMIT + 1), reasoning: '' };
    const port = fakePort([big as ChatStreamEvent, big as ChatStreamEvent]);
    const guarded = budgetLlmPort(port);
    expect(await send(guarded)).toEqual({ ok: false, failure: { kind: 'paused' } });
    expect(useLlmBudgetStore.getState().asking).toBe(true);
    expect(await send(guarded)).toEqual({ ok: false, failure: { kind: 'paused' } });
    expect(port.sent).toBe(1);

    resumeLlmBudget();
    expect(useLlmBudgetStore.getState().paused).toBeNull();
    await send(budgetLlmPort(fakePort([])));
    expect(useLlmBudgetStore.getState().paused).toBeNull();
  });

  it('入力は応答の数で数え、窓の間の合計が閾値を超えたら止め、次を送らない', async () => {
    const half = Math.ceil(WINDOW_INPUT_LIMIT / 2) + 1;
    const port = fakePort([usage(half, 10)]);
    const guarded = budgetLlmPort(port);
    expect((await send(guarded)).ok).toBe(true);
    // 2 回目の応答の数で閾値を超えたと分かる
    expect(await send(guarded)).toEqual({ ok: false, failure: { kind: 'paused' } });
    expect(await send(guarded)).toEqual({ ok: false, failure: { kind: 'paused' } });
    expect(port.sent).toBe(2);
  });
  it('中身が上限の時間届かなければ止める。処理中の印では数え直さない', async () => {
    vi.useFakeTimers();
    const silentMs = DEFAULT_SAFEGUARDS.llmSilentMinutes * 60_000;
    const sink: { deliver: (event: ChatStreamEvent) => void } = { deliver: () => undefined };
    /** 止める合図まで終わらない受け取り */
    const endless = {
      ...fakePort([]),
      streamChat: (_e: unknown, _r: unknown, { onEvent, signal }: ChatStreamReceiver) => {
        sink.deliver = onEvent;
        return new Promise((resolve) => {
          signal.addEventListener('abort', () =>
            resolve({ ok: false as const, failure: { kind: 'stopped' as const } }),
          );
        });
      },
    } as unknown as LlmPort;
    try {
      const pending = send(budgetLlmPort(endless));
      vi.advanceTimersByTime(silentMs - 1_000);
      sink.deliver({ kind: 'delta', content: 'a', reasoning: '' });
      vi.advanceTimersByTime(silentMs - 1_000);
      sink.deliver({ kind: 'processing' });
      vi.advanceTimersByTime(1_000);
      expect(await pending).toEqual({ ok: false, failure: { kind: 'timeout' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('窓より古い分は数えない', async () => {
    const port = fakePort([usage(WINDOW_INPUT_LIMIT - 10, 10)]);
    const guarded = budgetLlmPort(port);
    expect((await send(guarded)).ok).toBe(true);
    clock += BUDGET_WINDOW_MS + 1;
    expect((await send(guarded)).ok).toBe(true);
  });
});
