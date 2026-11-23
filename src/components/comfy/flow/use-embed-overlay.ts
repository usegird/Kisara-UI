import { useShallow } from 'zustand/react/shallow';

import { FLOW_VIEWPORT_ANCHOR_KEY } from '@/components/comfy/flow/anchor-context';
import { useEmbedTarget } from '@/components/ui/embed-anchors';
import { useAnchorRects, type AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { overlaySpan } from '@/lib/overlay-span';
import { useDialogStore } from '@/store/use-dialog-store';

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
