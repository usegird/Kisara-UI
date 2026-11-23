import { describe, expect, it } from 'vitest';

import { numberSpec, parseNumberText, snapNumber } from '@/graph/number-spec';

describe('数値の刻み', () => {
  it('定義の刻みを使う（strength_model は 0.01）', () => {
    const spec = numberSpec('FLOAT', { default: 1, min: -100, max: 100, step: 0.01 });

    expect(spec?.step).toBe(0.01);
    expect(spec?.round).toBe(0.01);
    expect(snapNumber(0.123456, spec!)).toBe(0.12);
    expect(snapNumber(0.1 + 0.2, spec!)).toBe(0.3);
  });

  it('定義に刻みが無ければ、小数は 0.5・整数は 1', () => {
    expect(numberSpec('FLOAT', {})?.step).toBe(0.5);
    expect(numberSpec('INT', {})?.step).toBe(1);
  });

  it('小数は定義の丸めの単位があればそれで丸める', () => {
    const spec = numberSpec('FLOAT', { step: 0.01, round: 0.001 });

    expect(snapNumber(0.12345, spec!)).toBe(0.123);
  });

  it('整数は下限を起点に刻みの倍数へ丸める', () => {
    const spec = numberSpec('INT', { min: 1, max: 100, step: 8 });

    expect(snapNumber(12, spec!)).toBe(9);
    expect(snapNumber(14, spec!)).toBe(17);
  });

  it('下限・上限に収める', () => {
    const spec = numberSpec('FLOAT', { min: 0, max: 1, step: 0.01 });

    expect(snapNumber(5, spec!)).toBe(1);
    expect(snapNumber(-5, spec!)).toBe(0);
  });

  it('数値でない型は対象外', () => {
    expect(numberSpec('STRING', { step: 1 })).toBeNull();
  });
});

describe('打った文字を値にする', () => {
  const int = numberSpec('INT', { min: 0, max: 100 })!;
  const seed = numberSpec('INT', { min: 0, max: 2 ** 64 })!;
  const float = numberSpec('FLOAT', { min: 0, max: 10, step: 0.1 })!;

  it('整数の欄は整数だけを受け取る（指数の書き方は数として読む）', () => {
    expect(parseNumberText('42', int)).toBe(42);
    expect(parseNumberText('1e1', int)).toBe(10);
    expect(parseNumberText('1.5', int)).toBeNull();
  });

  it('読めない・空・範囲の外・正しく持てない大きさは受け取らない', () => {
    expect(parseNumberText('', int)).toBeNull();
    expect(parseNumberText('abc', int)).toBeNull();
    expect(parseNumberText('101', int)).toBeNull();
    expect(parseNumberText('-1', int)).toBeNull();
    expect(parseNumberText('9007199254740993', seed)).toBeNull();
  });

  it('小数の欄は小数を受け取り、丸めの単位に揃える', () => {
    expect(parseNumberText('7.25', float)).toBe(7.3);
    expect(parseNumberText('11', float)).toBeNull();
  });
});
