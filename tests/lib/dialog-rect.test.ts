import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIDE_LIST_WIDTH,
  DIALOG_MIN,
  moveDialogRect,
  normalizeDialogRect,
  normalizeSideListWidth,
  offsetFloatingStart,
  resizeDialogRect,
  viewDialogRect,
} from '@/lib/dialog-rect';

// ─────────────────────────────
// 動かせるダイアログの位置と大きさ
// ─────────────────────────────

const VIEWPORT = { width: 1400, height: 850 };
const RECT = { left: 300, top: 100, width: 800, height: 600 };

describe('ダイアログの枠', () => {
  it('動かした量を足す', () => {
    expect(moveDialogRect(RECT, { dx: 50, dy: 20 }, VIEWPORT)).toMatchObject({
      left: 350,
      top: 120,
    });
  });

  it('最上段は画面の上に隠さず、横は掴む場所が残る所までしか出さない', () => {
    expect(moveDialogRect(RECT, { dx: 0, dy: -500 }, VIEWPORT).top).toBe(0);
    expect(moveDialogRect(RECT, { dx: 5000, dy: 0 }, VIEWPORT).left).toBe(VIEWPORT.width - 80);
    expect(moveDialogRect(RECT, { dx: -5000, dy: 0 }, VIEWPORT).left).toBe(80 - RECT.width);
  });

  it('大きさは下限を守り、画面の右下を越えない', () => {
    expect(resizeDialogRect(RECT, { dx: -2000, dy: -2000 }, VIEWPORT)).toMatchObject(DIALOG_MIN);
    expect(resizeDialogRect(RECT, { dx: 2000, dy: 2000 }, VIEWPORT)).toMatchObject({
      width: VIEWPORT.width - RECT.left,
      height: VIEWPORT.height - RECT.top,
    });
  });

  it('ダイアログが最小を指定すれば、その大きさまで縮められる', () => {
    const min = { width: 240, height: 320 };
    const shrunk = resizeDialogRect(RECT, { dx: -2000, dy: -2000, edge: 'se' }, VIEWPORT, min);
    expect(shrunk).toMatchObject(min);
    expect(viewDialogRect(shrunk, VIEWPORT, min)).toMatchObject(min);
  });

  it('壊れた保存値は指定なし', () => {
    expect(normalizeDialogRect({ left: 'x' })).toBeNull();
    expect(normalizeDialogRect(RECT)).toEqual(RECT);
  });

  it('左の列の幅は範囲に寄せ、壊れていれば既定', () => {
    expect(normalizeSideListWidth(10)).toBe(140);
    expect(normalizeSideListWidth(9999)).toBe(480);
    expect(normalizeSideListWidth('x')).toBe(DEFAULT_SIDE_LIST_WIDTH);
  });
});

describe('出すときの枠', () => {
  const view = { width: 1280, height: 720 };

  it('画面より大きければ、画面に収まる大きさへ縮めて全体が見える位置へ置く', () => {
    const shown = viewDialogRect({ left: 300, top: 100, width: 2400, height: 1400 }, view);
    expect(shown).toEqual({ left: 16, top: 16, width: 1248, height: 688 });
  });

  it('収まるなら残した値のまま', () => {
    const rect = { left: 100, top: 50, width: 800, height: 600 };
    expect(viewDialogRect(rect, view)).toEqual(rect);
  });
});

describe('辺と角で大きさを変える', () => {
  it('左の辺は右の辺を動かさずに広げ、画面の左端で止める', () => {
    expect(resizeDialogRect(RECT, { dx: -100, dy: 0, edge: 'w' }, VIEWPORT)).toEqual({
      ...RECT,
      left: 200,
      width: 900,
    });
    expect(resizeDialogRect(RECT, { dx: -1000, dy: 0, edge: 'w' }, VIEWPORT)).toMatchObject({
      left: 0,
      width: 1100,
    });
  });

  it('上の辺は最小の高さで止め、下の辺は動かさない', () => {
    const shrunk = resizeDialogRect(RECT, { dx: 0, dy: 1000, edge: 'n' }, VIEWPORT);
    expect(shrunk.height).toBe(DIALOG_MIN.height);
    expect(shrunk.top + shrunk.height).toBe(RECT.top + RECT.height);
  });

  it('上下の辺は横を変えず、左上の角は両方を変える', () => {
    expect(resizeDialogRect(RECT, { dx: 50, dy: 50, edge: 's' }, VIEWPORT)).toMatchObject({
      width: RECT.width,
      height: 650,
    });
    expect(resizeDialogRect(RECT, { dx: -50, dy: -50, edge: 'nw' }, VIEWPORT)).toEqual({
      left: 250,
      top: 50,
      width: 850,
      height: 650,
    });
  });
});

describe('初めて自由移動にしたときの枠', () => {
  it('大きさはそのまま、左下へずらす', () => {
    const start = offsetFloatingStart(RECT);
    expect(start.left).toBeLessThan(RECT.left);
    expect(start.top).toBeGreaterThan(RECT.top);
    expect([start.width, start.height]).toEqual([RECT.width, RECT.height]);
  });
});
