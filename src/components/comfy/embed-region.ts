import type { AnchorRect, Rects } from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// ComfyUI のタブで埋め込みのダイアログを嵌める範囲を、測った位置（外枠を原点）から決める。
// ─────────────────────────────

function shown(rect: AnchorRect | undefined): AnchorRect | undefined {
  return rect !== undefined && rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

/** 嵌める範囲の置き方。元の嵌め先がまだ測れていなければ null */
export function comfyEmbedRegion(rects: Rects): React.CSSProperties | null {
  const host = shown(rects.get('comfyHost'));
  if (host === undefined) return null;
  const side = shown(rects.get('side'));
  // 右に置いた列だけを使う（下に置いた帯は元の嵌め先の下にある）
  const beside = side !== undefined && side.left >= host.left && side.top < host.bottom;
  const right = beside ? Math.max(host.right, side.right) : host.right;
  return {
    left: host.left,
    top: host.top,
    width: right - host.left,
    height: host.bottom - host.top,
  };
}
