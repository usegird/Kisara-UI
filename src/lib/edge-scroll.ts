// ─────────────────────────────
// 掴んだまま列の上端・下端へ寄せたときの送り量（1 コマぶん）。
// 端に近いほど速くし、端を越えたら最も速く送る。帯より内側なら 0。
// ─────────────────────────────

/** 送り始める端からの距離（px） */
const EDGE_SCROLL_BAND = 48;
/** 1 コマで送る最大量（px） */
export const EDGE_SCROLL_MAX = 16;

/** 掴んだ位置 `y` から、列を 1 コマで送る量を求める（上へは負） */
export function edgeScrollStep(
  rect: { readonly top: number; readonly bottom: number },
  y: number,
  band = EDGE_SCROLL_BAND,
  max = EDGE_SCROLL_MAX,
): number {
  // 列の上下の外へ出たら最も速く送る（端を越えて寄せたとき止めない）
  if (y < rect.top) return -max;
  if (y > rect.bottom) return max;

  const fromTop = y - rect.top;
  if (fromTop < band) return -Math.ceil(max * (1 - fromTop / band));

  const fromBottom = rect.bottom - y;
  if (fromBottom < band) return Math.ceil(max * (1 - fromBottom / band));

  return 0;
}
