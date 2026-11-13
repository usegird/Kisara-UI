import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIDE_PANEL_HEIGHT,
  MAX_SIDE_PANEL_HEIGHT,
  MIN_SIDE_PANEL_HEIGHT,
  normalizeSidePanelHeight,
} from '@/store/settings-fields/side-panel-height';

describe('下に置いた右の列の高さ', () => {
  it('範囲外は端に寄せ、数でなければ既定に落とす', () => {
    expect(normalizeSidePanelHeight(10)).toBe(MIN_SIDE_PANEL_HEIGHT);
    expect(normalizeSidePanelHeight(99999)).toBe(MAX_SIDE_PANEL_HEIGHT);
    expect(normalizeSidePanelHeight(240.4)).toBe(240);
    expect(normalizeSidePanelHeight('240')).toBe(DEFAULT_SIDE_PANEL_HEIGHT);
    expect(normalizeSidePanelHeight(Number.NaN)).toBe(DEFAULT_SIDE_PANEL_HEIGHT);
  });
});
