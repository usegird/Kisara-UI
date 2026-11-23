import { describe, expect, it } from 'vitest';

import { comfyEmbedRegion } from '@/components/comfy/embed-region';
import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

function rect(left: number, top: number, right: number, bottom: number): AnchorRect {
  return { left, top, right, bottom, centerY: (top + bottom) / 2 };
}

const rects = (entries: Record<string, AnchorRect>): Rects => new Map(Object.entries(entries));
const host = rect(300, 48, 1000, 800);

describe('埋め込みの嵌め先', () => {
  it('右に置いた右の列が見えていれば、右端だけをその中身の欄の右端まで広げる', () => {
    expect(comfyEmbedRegion(rects({ comfyHost: host, side: rect(1020, 40, 1280, 782) }))).toEqual({
      left: 300,
      top: 48,
      width: 980,
      height: 752,
    });
  });

  it('右の列を縮めている・下に置いているときは元の嵌め先のまま', () => {
    expect(comfyEmbedRegion(rects({ comfyHost: host }))).toMatchObject({ width: 700 });
    const below = rect(0, 820, 1280, 1000);
    expect(comfyEmbedRegion(rects({ comfyHost: host, side: below }))).toMatchObject({ width: 700 });
  });

  it('元の嵌め先がまだ測れていなければ置かない', () => {
    expect(comfyEmbedRegion(rects({ side: rect(1020, 40, 1280, 782) }))).toBeNull();
  });
});
