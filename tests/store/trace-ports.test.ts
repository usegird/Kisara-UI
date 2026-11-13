import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearTrace, DEFAULT_TRACE_LEVELS, setTraceLevels, traceSnapshot } from '@/lib/trace';
import type { ComfyPort } from '@/port/comfy-port';
import type { LlmPort } from '@/port/llm-port';
import { traceComfyPort, traceLlmPort } from '@/store/ports/trace-ports';

// ─────────────────────────────
// 通信の窓口の包み。経路の名前と成否だけを残し、URL を残さない
// ─────────────────────────────

afterEach(() => {
  setTraceLevels(DEFAULT_TRACE_LEVELS);
  clearTrace();
});

function fakeComfy(fetchQueue: () => Promise<unknown>): ComfyPort {
  return {
    connection: {
      failureOf: () => ({ kind: 'http', url: 'http://10.0.0.1', message: 'x', status: 503 }),
    },
    run: { rejectionOf: () => null },
    queue: { fetchQueue, outputSrc: () => 'http://10.0.0.1/view' },
  } as unknown as ComfyPort;
}

describe('traceComfyPort', () => {
  it('成功は info・失敗は warn で、経路の名前と番号だけを残す', async () => {
    setTraceLevels({ comfy: 'info', llm: 'error' });
    const ok = traceComfyPort(fakeComfy(() => Promise.resolve({})));
    await ok.queue.fetchQueue('http://10.0.0.1');
    const ng = traceComfyPort(fakeComfy(() => Promise.reject(new Error('down'))));
    await expect(ng.queue.fetchQueue('http://10.0.0.1')).rejects.toThrow('down');

    const events = traceSnapshot().events;
    expect(events.map((event) => [event.level, event.detail?.route, event.detail?.ok])).toEqual([
      ['info', 'queue.fetchQueue', true],
      ['warn', 'queue.fetchQueue', false],
    ]);
    expect(events[1]?.detail?.status).toBe(503);
    expect(JSON.stringify(events)).not.toContain('10.0.0.1');
  });

  it('URL を作る関数はそのまま返し、段階が error なら何も残さない', async () => {
    const port = traceComfyPort(fakeComfy(() => Promise.resolve({})));
    expect(port.queue.outputSrc('x', { filename: 'a', subfolder: '', type: 'output' })).toBe(
      'http://10.0.0.1/view',
    );
    await port.queue.fetchQueue('x');
    expect(traceSnapshot().events).toHaveLength(0);
  });
});

describe('traceLlmPort', () => {
  it('失敗の種類と番号を残す', async () => {
    setTraceLevels({ comfy: 'error', llm: 'warn' });
    const port = traceLlmPort({
      listModels: vi.fn(() =>
        Promise.resolve({ ok: false as const, failure: { kind: 'auth' as const, status: 401 } }),
      ),
    } as unknown as LlmPort);
    await port.listModels({ baseUrl: 'https://api.example.com' });
    const [event] = traceSnapshot().events;
    expect(event?.detail).toMatchObject({ route: 'listModels', failure: 'auth', status: 401 });
  });
});
