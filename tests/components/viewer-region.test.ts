import { describe, expect, it } from 'vitest';

import { viewerRegion } from '@/components/comfy/queue/viewer-region';
import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// 会話のタブで画像ビューワーを重ねる範囲。
// ─────────────────────────────

function rect(left: number, top: number, right: number, bottom: number): AnchorRect {
  return { left, top, right, bottom, centerY: (top + bottom) / 2 };
}

const rects = (entries: Record<string, AnchorRect>): Rects => new Map(Object.entries(entries));

const chat = rect(200, 40, 1000, 800);
const column = rect(216, 700, 600, 800);
const tabs = rect(1024, 4, 1270, 32);
const side = rect(1020, 48, 1280, 782);

describe('重ねる範囲', () => {
  it('会話の入力欄の段の右端から右の列の右端まで。上端はタブの並び、下端は中身の欄', () => {
    expect(viewerRegion(rects({ chat, chatColumn: column, sideTabs: tabs, side }))).toEqual({
      left: 600,
      top: 4,
      width: 680,
      height: 778,
    });
  });

  it('入力欄の段とタブの並びが測れていなければ、右の列の中身の欄に重ねる', () => {
    expect(viewerRegion(rects({ chat, side }))).toEqual({
      left: 1020,
      top: 48,
      width: 260,
      height: 734,
    });
  });

  it('隠しているもの（幅 0）は使わない', () => {
    const hidden = rect(0, 0, 0, 0);
    const region = viewerRegion(rects({ chat, chatColumn: hidden, sideTabs: hidden, side }));
    expect(region).toMatchObject({ left: 1020, top: 48 });
  });

  it('右の列を縮めていれば会話の画面に重ね、左右を 16px 空ける', () => {
    const region = viewerRegion(rects({ chat, chatColumn: column }));
    expect(region).toMatchObject({ left: 216, width: 768 });
    expect(String(region?.top)).toContain('var(--spacing-column-top)');
  });

  it('まだ測れていなければ出さない', () => {
    expect(viewerRegion(new Map())).toBeNull();
  });
});
