import { useShallow } from 'zustand/react/shallow';

import { viewerRegion } from '@/components/comfy/queue/viewer-region';
import { ViewerOverlay } from '@/components/comfy/queue/ViewerOverlay';
import { useEmbedAnchors } from '@/components/ui/embed-anchors';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';
import { useDialogStore } from '@/store/use-dialog-store';
import { useViewerStore } from '@/store/use-viewer-store';

// ─────────────────────────────
// 会話のタブに画像のビューワーを重ねる置き場。開いている間だけ、嵌める先の枠とビューワーを出す。
// ─────────────────────────────

/** 会話のタブで画像のビューワーを開いている間だけ、重ねる置き場を出す */
export function ViewerHost(): React.ReactElement | null {
  const open = useViewerStore((state) => state.mode === 'overlay');
  if (!open) return null;
  return <OpenViewerHost />;
}

function OpenViewerHost(): React.ReactElement {
  const anchors = useEmbedAnchors();
  const setEmbedHost = useDialogStore((state) => state.setEmbedHost);
  const region = useAnchorRects(
    anchors,
    useShallow((rects) => viewerRegion(rects) ?? {}),
  );
  const measured = Object.keys(region).length > 0;
  return (
    // 重ねる範囲は列をまたぐので、外枠いっぱいを測る原点にする。開いている間だけ付けるので、閉じている間は測らない
    <div ref={anchors?.attachContainer} className="pointer-events-none absolute inset-0 z-30">
      {measured ? (
        <>
          <div ref={setEmbedHost} className="absolute" style={region} />
          <ErrorBoundary label={t('comfy.workspace.imageView')}>
            <ViewerOverlay />
          </ErrorBoundary>
        </>
      ) : null}
    </div>
  );
}
