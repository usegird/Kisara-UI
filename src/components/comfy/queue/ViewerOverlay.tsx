import { ExternalLink } from 'lucide-react';

import { LazyViewerSurface } from '@/components/comfy/queue/LazyViewerSurface';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogWindow } from '@/components/ui/dialog-window';
import { useQueueTasks } from '@/hooks/run/use-queue-tasks';
import { t } from '@/i18n';
import { openPopup } from '@/lib/popup';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore, VIEWER_WINDOW } from '@/store/use-viewer-store';

export function ViewerOverlay(): React.ReactElement {
  const queueTasks = useQueueTasks();
  const ownTasks = useViewerStore((state) => state.tasks);
  const tasks = ownTasks ?? queueTasks;
  const baseUrl = useSettingsStore((state) => state.baseUrl);

  const current = useViewerStore((state) => state.current);
  const blocked = useViewerStore((state) => state.blocked);
  const setCurrent = useViewerStore((state) => state.setCurrent);
  const openWindow = useViewerStore((state) => state.openWindow);
  const close = useViewerStore((state) => state.close);

  return (
    <DialogWindow
      id="image-viewer"
      label={t('queue.viewer.title')}
      defaultMode="embedded"
      floatable={false}
      onClose={close}
    >
      <LazyViewerSurface
        tasks={tasks}
        current={current}
        baseUrl={baseUrl}
        onChange={setCurrent}
        onClose={close}
        bar="header"
        keyTarget={globalThis.window}
        extra={
          <>
            {blocked ? (
              <span
                className="text-destructive shrink-0 text-xs"
                title={t('queue.viewer.allowInBrowser')}
              >
                {t('queue.viewer.cannotOpenWindow')}
              </span>
            ) : null}
            <button
              type="button"
              className={DIALOG_ICON_CLASS}
              aria-label={t('queue.viewer.openWindow')}
              title={t('queue.viewer.openWindowHint')}
              onClick={() => openWindow(openPopup(VIEWER_WINDOW, 'Image viewer'), current)}
            >
              <ExternalLink className="size-4" aria-hidden />
            </button>
          </>
        }
      />
    </DialogWindow>
  );
}
