import { useShallow } from 'zustand/react/shallow';

import { FLOW_VIEWPORT_ANCHOR_KEY } from '@/components/comfy/flow/anchor-context';
import { useEmbedTarget } from '@/components/ui/embed-anchors';
import { useAnchorRects, type AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { overlaySpan } from '@/lib/overlay-span';
import { useDialogStore } from '@/store/use-dialog-store';

// ─────────────────────────────
// 埋め込みのダイアログの元の嵌め先の置き場所を決める
// ─────────────────────────────

/**
 * 埋め込みのダイアログの元の嵌め先の置き場所。外枠はこれを測り、右の列まで広げた
 * 嵌め先を置く（外枠に台帳が無いデモでは、これがそのまま嵌め先）。
 * 測れる前（描いた直後の 1 回）は中身の右端まで広げる
 */
export function useEmbedOverlay(
  anchors: AnchorRegistry,
  start: number,
): {
  readonly setEmbedHost: (element: HTMLElement | null) => void;
  readonly overlaid: boolean;
  readonly overlayStyle: React.CSSProperties;
} {
  const setEmbedHost = useEmbedTarget('comfyHost');
  const overlaid = useDialogStore((state) =>
    state.order.some((entry) => entry.mode === 'embedded'),
  );
  // 見えている範囲の左右だけを受け取る（列を縦に送っても描き直さない）
  const flowViewport = useAnchorRects(
    anchors,
    useShallow((rects) => {
      const rect = rects.get(FLOW_VIEWPORT_ANCHOR_KEY);
      return rect === undefined ? undefined : { left: rect.left, right: rect.right };
    }),
  );
  const span = overlaySpan(start, flowViewport);
  const overlayStyle = span === null ? { left: start, right: 0 } : span;
  return { setEmbedHost, overlaid, overlayStyle };
}
