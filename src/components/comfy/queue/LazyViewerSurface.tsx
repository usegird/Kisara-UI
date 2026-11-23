import type { ViewerSurfaceProps } from '@/components/comfy/queue/ViewerSurface';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';

export const LazyViewerSurface = lazyPart<ViewerSurfaceProps>(
  'queue.viewer.title',
  () => import('@/components/comfy/queue/ViewerSurface').then((m) => m.ViewerSurface),
  () => <PartLoading label={t('queue.viewer.title')} />,
);
