import type { ViewerSurfaceProps } from '@/components/comfy/queue/ViewerSurface';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';

// ─────────────────────────────
// 結果画像のビューワーの中身を、開いたときに読む。
// タブへの重ねと別ウィンドウの両方が同じものを使うので、読み方をここで 1 つにする。
// ─────────────────────────────

/** 開いたときに読み込む結果画像のビューワーの中身 */
export const LazyViewerSurface = lazyPart<ViewerSurfaceProps>(
  'queue.viewer.title',
  () => import('@/components/comfy/queue/ViewerSurface').then((m) => m.ViewerSurface),
  () => <PartLoading label={t('queue.viewer.title')} />,
);
