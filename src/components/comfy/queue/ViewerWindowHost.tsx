import { ImageViewer } from '@/components/comfy/queue/ImageViewer';
import { useQueueTasks } from '@/hooks/run/use-queue-tasks';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';

export function ViewerWindowHost(): React.ReactElement | null {
  const windowed = useViewerStore((state) => state.mode === 'window');
  return windowed ? <WindowedViewer /> : null;
}

function WindowedViewer(): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const queueTasks = useQueueTasks();
  const ownTasks = useViewerStore((state) => state.tasks);
  const popup = useViewerStore((state) => state.popup);
  const current = useViewerStore((state) => state.current);
  const setCurrent = useViewerStore((state) => state.setCurrent);
  const close = useViewerStore((state) => state.close);
  return (
    <ImageViewer
      popup={popup}
      tasks={ownTasks ?? queueTasks}
      current={current}
      baseUrl={baseUrl}
      onChange={setCurrent}
      onClose={close}
    />
  );
}
