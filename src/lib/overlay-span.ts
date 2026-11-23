interface OverlaySpan {
  readonly left: number;
  readonly width: number;
}

export function overlaySpan(
  start: number,
  viewport: { readonly left: number; readonly right: number } | undefined,
): OverlaySpan | null {
  if (viewport === undefined) return null;

  const left = Math.max(start, viewport.left);
  return { left, width: Math.max(0, viewport.right - left) };
}
