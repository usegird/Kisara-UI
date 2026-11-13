import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearTrace,
  DEFAULT_TRACE_LEVELS,
  EVENT_CAPACITY,
  FAULT_CAPACITY,
  parseTraceLevels,
  redactText,
  scrubKnown,
  setTraceLevels,
  storedTraceLevels,
  traceEvent,
  traceFault,
  traceSnapshot,
  traceVerbose,
} from '@/lib/trace';

// ─────────────────────────────
// 診断のログの入れ物。段階の下は作らない・失敗を押し出さない・URL とパスを入れない
// ─────────────────────────────

afterEach(() => {
  setTraceLevels(DEFAULT_TRACE_LEVELS);
  clearTrace();
});

describe('段階', () => {
  it('段階より細かい出来事は、中身を作らずに捨てる', () => {
    setTraceLevels({ comfy: 'warn', llm: 'error' });
    const detail = vi.fn(() => ({ route: 'x' }));
    traceEvent('comfy', 'info', 'request', detail);
    traceEvent('llm', 'warn', 'request', detail);
    expect(detail).not.toHaveBeenCalled();
    traceEvent('comfy', 'warn', 'request', detail);
    expect(traceSnapshot().events.map((event) => event.area)).toEqual(['comfy']);
  });

  it('既定（すべて error）では出来事を溜めない', () => {
    traceEvent('llm', 'warn', 'tab.switch');
    expect(traceSnapshot().events).toHaveLength(0);
  });

  it('`debug` は端末に `warn` として残し、読めない値は既定に戻す', () => {
    expect(storedTraceLevels({ comfy: 'debug', llm: 'info' })).toEqual({
      comfy: 'warn',
      llm: 'info',
    });
    expect(parseTraceLevels({ comfy: 'debug', llm: 'loud' })).toEqual({
      comfy: 'debug',
      llm: 'error',
    });
    expect(traceVerbose({ comfy: 'error', llm: 'debug' })).toBe(true);
  });
});

describe('上限', () => {
  it('出来事は段階の上限で古い方から外し、失敗は押し出さない', () => {
    setTraceLevels({ comfy: 'warn', llm: 'error' });
    traceFault('where', new Error('boom'));
    for (let i = 0; i < EVENT_CAPACITY.warn + 5; i += 1) {
      traceEvent('comfy', 'warn', 'request', () => ({ i }));
    }
    const { events, faults } = traceSnapshot();
    expect(events).toHaveLength(EVENT_CAPACITY.warn);
    expect(events[0]?.detail?.i).toBe(5);
    expect(faults).toHaveLength(1);
  });

  it('出来事は分野ごとに数え、多い分野がほかの分野を押し出さない', () => {
    setTraceLevels({ comfy: 'warn', llm: 'warn' });
    traceEvent('llm', 'warn', 'only', () => ({}));
    for (let i = 0; i < EVENT_CAPACITY.warn + 5; i += 1) {
      traceEvent('comfy', 'warn', 'request', () => ({ i }));
    }
    const { events } = traceSnapshot();
    expect(events.filter((event) => event.area === 'llm')).toHaveLength(1);
    expect(events.filter((event) => event.area === 'comfy')).toHaveLength(EVENT_CAPACITY.warn);
  });

  it('続けて同じ失敗は 1 件にまとめて回数を数え、初めの原因を押し出さない', () => {
    traceFault('where', new Error('first'));
    const repeated = new Error('again');
    for (let i = 0; i < FAULT_CAPACITY + 3; i += 1) traceFault('where', repeated);
    const { faults } = traceSnapshot();
    expect(faults.map((fault) => fault.message)).toEqual(['first', 'again']);
    expect(faults[1]?.count).toBe(FAULT_CAPACITY + 3);
  });

  it('文字に直せない値で失敗しても、記録は落ちない', () => {
    traceFault('where', Object.create(null));
    expect(traceSnapshot().faults[0]?.message).toBe('[object Object]');
  });

  it('失敗は決めた数までにする', () => {
    for (let i = 0; i < FAULT_CAPACITY + 3; i += 1) traceFault('where', new Error(`e${i}`));
    const { faults } = traceSnapshot();
    expect(faults).toHaveLength(FAULT_CAPACITY);
    expect(faults[0]?.message).toBe('e3');
  });
});

describe('失敗', () => {
  it('原因の連なりを残し、自分を指す原因で回り続けない', () => {
    const inner = new Error('inner');
    const outer = new Error('outer', { cause: inner });
    (inner as { cause?: unknown }).cause = outer;
    traceFault('where', outer, '\n    at Card');
    const [fault] = traceSnapshot().faults;
    expect(fault?.causes.map((cause) => cause.message)).toEqual(['inner']);
    expect(fault?.componentStack).toContain('Card');
    expect(fault?.stack).not.toBeNull();
  });
});

describe('置き換え', () => {
  it('接続先の URL を種類だけにし、ファイルのパスを消す', () => {
    const text = redactText(
      'failed http://192.168.1.5:8188/object_info and https://api.example.com/v1 ' +
        'C:\\Users\\user\\models\\a.safetensors /home/user/ComfyUI/models',
    );
    expect(text).not.toContain('192.168');
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('user');
    expect(text).toContain('<url:http-private>');
    expect(text).toContain('<url:https-remote>');
    expect(text).toContain('<path>');
  });

  it('スキームの無いホストとポート・Bearer・キーに見える文字列も消す', () => {
    const text = redactText(
      '接続先 URL の形式が不正です: 192.168.0.5:8188 / comfy.example.jp:443 / localhost:8188 ' +
        'Authorization: Bearer abc.def sk-or-v1-0123456789abcdefABCDEF0123',
    );
    expect(text).not.toMatch(/192\.168|example\.jp|localhost:8188|abc\.def|sk-or/);
    expect(text).toContain('<host>');
    expect(text).toContain('Bearer <key>');
  });

  it('分かっている値は、型によらずそのまま探して消す', () => {
    expect(scrubKnown('bad url: my-pc/comfy key=SECRETKEY', ['my-pc/comfy', 'SECRETKEY'])).toBe(
      'bad url: <redacted> key=<redacted>',
    );
  });
});
