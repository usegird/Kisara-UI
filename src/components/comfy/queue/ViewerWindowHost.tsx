import { ImageViewer } from '@/components/comfy/queue/ImageViewer';
import { useQueueTasks } from '@/hooks/run/use-queue-tasks';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';

// ─────────────────────────────
// 画像のビューワーの別窓の出し先。どのタブを出していても同じ出し先にするため、画面に 1 つだけ置く。
// ─────────────────────────────

/** 別窓で見ている間だけ、画像のビューワーを別窓へ出す */
export function ViewerWindowHost(): React.ReactElement | null {
  const windowed = useViewerStore((state) => state.mode === 'window');
  // 別窓で見ている間だけキュー列の並びを購読する
  return windowed ? <WindowedViewer /> : null;
}

function WindowedViewer(): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const queueTasks = useQueueTasks();
  // 開いた側が預けた並び（履歴・会話の画像）があればそれを、無ければキュー列の並びを見せる
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
