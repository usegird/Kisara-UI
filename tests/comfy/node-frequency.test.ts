import { describe, expect, it } from 'vitest';

import { parseNodeFrequency } from '@/comfy/node-frequency';

describe('利用頻度の表', () => {
  it('回数の多い順。同数は元の順', () => {
    expect(parseNodeFrequency({ B: 2, A: 5, C: 2 })).toEqual(['A', 'B', 'C']);
  });

  it('回数が数でないものは落とし、形が違えば空', () => {
    expect(parseNodeFrequency({ A: 1, B: '3', C: null })).toEqual(['A']);
    expect(parseNodeFrequency(['A'])).toEqual([]);
    expect(parseNodeFrequency(null)).toEqual([]);
  });
});
