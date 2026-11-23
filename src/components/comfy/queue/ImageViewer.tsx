import { createPortal } from 'react-dom';

import { LazyViewerSurface } from '@/components/comfy/queue/LazyViewerSurface';
import { usePopupContainer } from '@/hooks/ui/use-popup-container';
import type { Popup } from '@/lib/popup';
import type { QueueTask } from '@/queue/queue-tasks';

export interface ImageViewerProps {
  readonly popup: Popup | null;
  readonly tasks: readonly QueueTask[];
  readonly current: string | null;
  readonly baseUrl: string;
  readonly onChange: (key: string) => void;
  readonly onClose: () => void;
}

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
