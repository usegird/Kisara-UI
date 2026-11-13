import { createPortal } from 'react-dom';

import { LazyViewerSurface } from '@/components/comfy/queue/LazyViewerSurface';
import { usePopupContainer } from '@/hooks/ui/use-popup-container';
import type { Popup } from '@/lib/popup';
import type { QueueTask } from '@/queue/queue-tasks';

// ─────────────────────────────
// 結果画像のビューワーの別ウィンドウの出し先。中身は重ねて出すときと同じものを使う。
// 開いた先へそのまま描き込むので、同じ状態を購読できる。
// ─────────────────────────────

/** 別ウィンドウのビューワーの受け取り物 */
export interface ImageViewerProps {
  /** 開いたウィンドウ。null なら閉じている。**開くのはクリックの処理の中** */
  readonly popup: Popup | null;
  /** キュー列と同じ並び（新しいものが先頭） */
  readonly tasks: readonly QueueTask[];
  readonly current: string | null;
  readonly baseUrl: string;
  readonly onChange: (key: string) => void;
  readonly onClose: () => void;
}

/** 開いたウィンドウへビューワーを描き込み、ウィンドウが閉じられたら閉じる */
export function ImageViewer({
  popup,
  tasks,
  current,
  baseUrl,
  onChange,
  onClose,
}: ImageViewerProps): React.ReactElement | null {
  usePopupContainer(popup, onClose);

  if (popup === null) return null;

  return createPortal(
    <div className="h-screen">
      <LazyViewerSurface
        tasks={tasks}
        current={current}
        baseUrl={baseUrl}
        onChange={onChange}
        onClose={onClose}
        keyTarget={popup.window}
      />
    </div>,
    popup.mount,
  );
}
