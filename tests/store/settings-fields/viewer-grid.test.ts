import { describe, expect, it } from 'vitest';

import { normalizeViewerGrid, VIEWER_GRID_MAX } from '@/store/settings-fields/viewer-grid';

describe('行×列の読み戻し', () => {
  it('残した値をそのまま戻す', () => {
    expect(normalizeViewerGrid({ rows: 2, cols: 3 })).toEqual({ rows: 2, cols: 3 });
  });

  it('壊れていれば 1、範囲を外れたら端に寄せる', () => {
    expect(normalizeViewerGrid('x')).toEqual({ rows: 1, cols: 1 });
    expect(normalizeViewerGrid({ rows: 0, cols: 99 })).toEqual({ rows: 1, cols: VIEWER_GRID_MAX });
  });
});
