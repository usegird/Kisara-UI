import { describe, expect, it } from 'vitest';

import {
  buildGenerationFigures,
  buildResponseFigures,
  liveTiming,
} from '@/components/llm/message/response-figures';
import type { ResponseStats } from '@/store/use-response-stats-store';

// ─────────────────────────────
// 応答の情報の行。1 行目がサーバー側のツール、2 行目がトークンの処理で、
// どちらも末尾に費用（参考）。受け取り中は測っている途中の値を同じ形にして使う。
// ─────────────────────────────

const usage = { prompt: 1000, completion: 50 };

function stats(patch: Partial<ResponseStats> = {}): ResponseStats {
  return {
    sentAt: 0,
    firstAt: 500,
    endedAt: 2500,
    price: { prompt: 0.000001, completion: 0.000002, cacheRead: null, cacheWrite: null },
    tooling: false,
    serverTools: false,
    ...patch,
  };
}

type Lines = ReturnType<typeof buildResponseFigures>;
const keys = (lines: Lines) => lines.map((line) => line.map((figure) => figure.key));
const valueOf = (lines: Lines, key: string) =>
  lines.flat().find((figure) => figure.key === key)?.value;

describe('応答の情報の行', () => {
  it('ツールを使わなければトークンの処理の 1 行だけで、末尾に費用（参考）。時間の行は出さない', () => {
    const timing = { firstMs: 500, receivingMs: 2000, referenceUsd: 0.0011 };
    const lines = buildResponseFigures(usage, timing, undefined, true);
    expect(keys(lines)).toEqual([['tokens', 'speed', 'cost']]);
    expect(valueOf(lines, 'speed')).toBe('25 トークン/秒');
    expect(valueOf(lines, 'cost')).toBe('$0.0011（参考）');
  });

  it('ツールの行の費用は API の費用から推論の費用を引いた分。推論の費用は API の値を先に使う', () => {
    const billing = { searches: 1, toolCalls: 1, cost: 0.00553, inferenceCost: 0.00053 };
    const lines = buildResponseFigures(usage, { referenceUsd: 0.0009 }, billing, true);
    expect(keys(lines)).toEqual([
      ['searches', 'toolCalls', 'toolCost'],
      ['tokens', 'cost'],
    ]);
    expect(valueOf(lines, 'toolCost')).toBe('$0.005（参考）');
    expect(valueOf(lines, 'cost')).toBe('$0.00053（参考）');
  });

  it('推論の費用が返らなければ計算した値で引く。ツールを使わなければ API の費用をトークンの行に出す', () => {
    const withTools = buildResponseFigures(
      usage,
      { referenceUsd: 0.001 },
      { toolCalls: 2, cost: 0.003 },
      true,
    );
    expect(valueOf(withTools, 'toolCost')).toBe('$0.002（参考）');
    const plain = buildResponseFigures(usage, { referenceUsd: 0.001 }, { cost: 0.0012 }, true);
    expect(keys(plain)).toEqual([['tokens', 'cost']]);
    expect(valueOf(plain, 'cost')).toBe('$0.0012（参考）');
  });

  it('キャッシュの読み・書きは 0 でないときだけ、トークンの後にそれぞれ出す', () => {
    const lines = buildResponseFigures({ ...usage, cacheRead: 800, cacheWrite: 150 }, undefined);
    expect(keys(lines)).toEqual([['tokens', 'cacheRead', 'cacheWrite']]);
    expect(valueOf(lines, 'cacheRead')).toBe('800 トークン');
    expect(valueOf(lines, 'cacheWrite')).toBe('150 トークン');
    const readOnly = buildResponseFigures({ ...usage, cacheRead: 800, cacheWrite: 0 }, undefined);
    expect(keys(readOnly)).toEqual([['tokens', 'cacheRead']]);
    expect(keys(buildResponseFigures({ ...usage, cacheRead: 0 }, undefined))).toEqual([['tokens']]);
    expect(keys(buildResponseFigures(usage, undefined))).toEqual([['tokens']]);
  });

  it('計算する費用はキャッシュの読み・書きをそれぞれの単価で数え、単価が無ければ prompt で数える', () => {
    const cached = { ...usage, cacheRead: 800, cacheWrite: 150 };
    const price = { prompt: 0.000001, completion: 0.000002, cacheRead: 1e-7, cacheWrite: 1.25e-6 };
    // 50 × 1e-6 ＋ 800 × 1e-7 ＋ 150 × 1.25e-6 ＋ 50 × 2e-6
    expect(liveTiming(stats({ price }), cached)?.referenceUsd).toBeCloseTo(0.0004175, 10);
    expect(liveTiming(stats(), cached)?.referenceUsd).toBeCloseTo(0.0011, 10);
  });

  it('本番（費用を出さない）では回数・トークン・スループットだけ', () => {
    const billing = { searches: 1, toolCalls: 1, cost: 0.00553, inferenceCost: 0.00053 };
    const lines = buildResponseFigures(
      usage,
      { receivingMs: 2000, referenceUsd: 0.001 },
      billing,
      false,
    );
    expect(keys(lines)).toEqual([
      ['searches', 'toolCalls'],
      ['tokens', 'speed'],
    ]);
  });

  it('受け取り中は測っている途中の値を同じ形にする。終わる前は受け取りの時間を出さない', () => {
    expect(liveTiming(stats(), usage)).toEqual({
      firstMs: 500,
      receivingMs: 2000,
      referenceUsd: 0.0011,
    });
    expect(liveTiming(stats({ endedAt: null }), usage)).toEqual({
      firstMs: 500,
      referenceUsd: 0.0011,
    });
    expect(liveTiming(undefined, usage)).toBeUndefined();
  });

  it('作らせた応答はトークン・時間（送ってから受け取り終わるまで）・費用の 1 行', () => {
    const timing = { firstMs: 500, receivingMs: 2000, referenceUsd: 0.0011 };
    const line = buildGenerationFigures({ usage, timing }, true);
    expect(line.map((figure) => figure.key)).toEqual(['tokens', 'time', 'cost']);
    expect(line.find((figure) => figure.key === 'time')?.value).toContain('2.5');
    expect(buildGenerationFigures({ usage, timing }, false).map((f) => f.key)).toEqual([
      'tokens',
      'time',
    ]);
    expect(buildGenerationFigures({})).toEqual([]);
  });

  it('記録の無い候補はトークン数だけ。費用が分からなければ費用を出さない', () => {
    expect(keys(buildResponseFigures(usage, undefined))).toEqual([['tokens']]);
    const unknown = liveTiming(stats({ price: { ...stats().price, completion: null } }), usage);
    expect(keys(buildResponseFigures(usage, unknown, undefined, true)).flat()).not.toContain(
      'cost',
    );
    expect(buildResponseFigures(undefined, undefined)).toEqual([]);
  });
});
