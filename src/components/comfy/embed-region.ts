import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

function shown(rect: AnchorRect | undefined): AnchorRect | undefined {
  return rect !== undefined && rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

export function comfyEmbedRegion(rects: Rects): React.CSSProperties | null {
  const host = shown(rects.get('comfyHost'));
  if (host === undefined) return null;
  const side = shown(rects.get('side'));
  const beside = side !== undefined && side.left >= host.left && side.top < host.bottom;
  const right = beside ? Math.max(host.right, side.right) : host.right;
  return {
    left: host.left,
    top: host.top,
    width: right - host.left,
    height: host.bottom - host.top,
  };
}
