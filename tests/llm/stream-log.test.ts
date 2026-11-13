import { afterEach, describe, expect, it } from 'vitest';

import { createSseReader, observeSseLines } from '@/llm/sse';
import { createStreamLog, STREAM_LOG_LIMIT } from '@/llm/stream-log';

// ─────────────────────────────
// 受け取った SSE の行の記録。注釈の行も残し、読み取りの結果は変えない
// ─────────────────────────────

afterEach(() => observeSseLines(null));

describe('受け取った行の記録', () => {
  it('注釈の行も含めて、要求ごとの区切りと送ってからの秒で残す。読み取りは data だけを返す', () => {
    let time = 0;
    const log = createStreamLog(() => time);
    const reader = createSseReader();
    time = 1500;
    const events = reader.push(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\n');
    expect(events).toEqual(['{"a":1}']);
    const lines = log.lines();
    expect(lines[0]).toMatch(/^# request 1 /);
    expect(lines.slice(1)).toEqual(['1.50s\t: OPENROUTER PROCESSING', '1.50s\tdata: {"a":1}']);
  });

  it('新しい行だけを上限まで残し、消すと空になる', () => {
    const log = createStreamLog(() => 0);
    const reader = createSseReader();
    reader.push(
      Array.from({ length: STREAM_LOG_LIMIT + 10 }, (_, i) => `: ${String(i)}\n`).join(''),
    );
    const lines = log.lines();
    expect(lines).toHaveLength(STREAM_LOG_LIMIT);
    expect(lines.at(-1)).toBe(`0.00s\t: ${String(STREAM_LOG_LIMIT + 9)}`);
    log.clear();
    expect(log.lines()).toEqual([]);
  });

  it('記録を入れていなければ、読み取りは何も渡さない', () => {
    const reader = createSseReader();
    expect(reader.push(': ping\n\ndata: x\n\n')).toEqual(['x']);
  });
});
