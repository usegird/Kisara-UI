import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SAFEGUARDS,
  normalizeSafeguards,
  safeguardOverrides,
} from '@/store/settings-fields/safeguards';

// ─────────────────────────────
// 防御機構の値。既定と違う値だけを残し、壊れた値は既定に落とす。
// ─────────────────────────────

describe('防御機構の値', () => {
  it('既定は繰り返しの連続失敗 5 回・最短の間隔 1000ms・上限 1000 回', () => {
    expect(DEFAULT_SAFEGUARDS).toMatchObject({
      repeatFailureLimit: 5,
      repeatMinIntervalMs: 1000,
      repeatMaxRuns: 1000,
    });
  });

  it('残っている値は読み、正の有限の数でない項目は既定にする', () => {
    const read = normalizeSafeguards({ repeatMaxRuns: 20, repeatFailureLimit: -1, extra: 1 });
    expect(read.repeatMaxRuns).toBe(20);
    expect(read.repeatFailureLimit).toBe(DEFAULT_SAFEGUARDS.repeatFailureLimit);
    expect(read).not.toHaveProperty('extra');
    expect(normalizeSafeguards('x')).toEqual(DEFAULT_SAFEGUARDS);
  });

  it('残すのは既定と違う項目だけ。既定のままなら何も残さない', () => {
    expect(safeguardOverrides(DEFAULT_SAFEGUARDS)).toBeUndefined();
    expect(safeguardOverrides({ ...DEFAULT_SAFEGUARDS, repeatMaxRuns: 20 })).toEqual({
      repeatMaxRuns: 20,
    });
  });
});
