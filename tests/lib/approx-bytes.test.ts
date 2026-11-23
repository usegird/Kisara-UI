import { describe, expect, it } from 'vitest';

import { approxBytes } from '@/lib/approx-bytes';

describe('approxBytes', () => {
  it('文字は UTF-8 の長さで数える（サロゲートの組は 4）', () => {
    expect(approxBytes('abc')).toBe(3);
    expect(approxBytes('あ')).toBe(3);
    expect(approxBytes('é')).toBe(2);
    expect(approxBytes('😀')).toBe(4);
  });

  it('Blob・バイト列はそのままの大きさ、物は鍵と中身を足す', () => {
    expect(approxBytes(new Blob(['12345']))).toBe(5);
    expect(approxBytes(new Uint8Array(7))).toBe(7);
    expect(approxBytes({ ab: 'cd', n: 1 })).toBe(2 + 2 + 1 + 8);
    expect(approxBytes([true, null, undefined])).toBe(4);
  });

  it('同じ物を 2 度たどらない（輪になっても止まる）', () => {
    const loop: Record<string, unknown> = { a: 'x' };
    loop.self = loop;
    expect(approxBytes(loop)).toBe(1 + 1 + 4);
  });
});
