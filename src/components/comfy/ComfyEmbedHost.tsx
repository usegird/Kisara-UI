import { useShallow } from 'zustand/react/shallow';

import { comfyEmbedRegion } from '@/components/comfy/embed-region';
import { useEmbedAnchors } from '@/components/ui/embed-anchors';
import { useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { useDialogStore } from '@/store/use-dialog-store';

export function ComfyEmbedHost(): React.ReactElement {
  const anchors = useEmbedAnchors();
  const setEmbedHost = useDialogStore((state) => state.setEmbedHost);
  const region = useAnchorRects(
    anchors,
    useShallow((rects) => comfyEmbedRegion(rects) ?? {}),
  );
  const measured = Object.keys(region).length > 0;
  return (
    <div ref={anchors?.attachContainer} className="pointer-events-none absolute inset-0 z-30">
      {measured ? (
        <div ref={setEmbedHost} data-flow-overlay className="absolute" style={region} />
      ) : null}
    </div>
  );
}
