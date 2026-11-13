import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SPLIT_RATIO,
  dragSplitRatio,
  normalizeSplitRatio,
} from '@/store/settings-fields/split-ratio';

// ─────────────────────────────
// 左右に分けた枠の割合（実行の詳細の画像の幅）
// ─────────────────────────────

describe('左右の割合', () => {
  it('境目を左へ動かすと右側が広がり、端には寄せすぎない', () => {
    expect(dragSplitRatio(0.5, -100, 1000)).toBeCloseTo(0.6);
    expect(dragSplitRatio(0.5, -1000, 1000)).toBe(0.8);
    expect(dragSplitRatio(0.5, 1000, 1000)).toBe(0.2);
  });

  it('壊れた保存値は既定', () => {
    expect(normalizeSplitRatio('x')).toBe(DEFAULT_SPLIT_RATIO);
    expect(normalizeSplitRatio(Number.NaN)).toBe(DEFAULT_SPLIT_RATIO);
  });
});
