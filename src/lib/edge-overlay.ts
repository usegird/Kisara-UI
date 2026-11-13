import type { Point } from '@/lib/point';

// ─────────────────────────────
// 枠の端に重ねる欄（右端か下端）が、ある点を覆うか。ComfyUI 非依存の座標計算。
// ─────────────────────────────

/** 欄を重ねる端 */
export type EdgeDock = 'right' | 'bottom';

/** 枠の右端と下端の位置 */
interface EdgeArea {
  readonly right: number;
  readonly bottom: number;
}

/**
 * 枠（`area`）の `dock` 側の端に、幅（下なら高さ）`size` の欄を重ねたとき、`point` を覆うか。
 * 枠の外側の点は呼び出し側で除く（ここでは端からの距離だけを見る）
 */
export function edgeOverlayCovers(
  area: EdgeArea,
  dock: EdgeDock,
  size: number,
  point: Point,
): boolean {
  return dock === 'right' ? point.x >= area.right - size : point.y >= area.bottom - size;
}
