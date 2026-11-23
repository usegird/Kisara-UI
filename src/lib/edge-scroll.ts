const EDGE_SCROLL_BAND = 48;
export const EDGE_SCROLL_MAX = 16;

export function edgeScrollStep(
  rect: { readonly top: number; readonly bottom: number },
  y: number,
  band = EDGE_SCROLL_BAND,
  max = EDGE_SCROLL_MAX,
): number {
  if (y < rect.top) return -max;
  if (y > rect.bottom) return max;

  const fromTop = y - rect.top;
  if (fromTop < band) return -Math.ceil(max * (1 - fromTop / band));

  const fromBottom = rect.bottom - y;
  if (fromBottom < band) return Math.ceil(max * (1 - fromBottom / band));

  return 0;
}
