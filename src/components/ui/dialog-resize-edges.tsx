import { cva } from 'class-variance-authority';

import type { DragHandlers } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { RESIZE_EDGES, type ResizeEdge } from '@/lib/dialog-rect';

const edgeHandle = cva('absolute z-10', {
  variants: {
    edge: {
      n: 'inset-x-3 top-0 h-1.5 cursor-ns-resize',
      s: 'inset-x-3 bottom-0 h-1.5 cursor-ns-resize',
      e: 'inset-y-3 right-0 w-1.5 cursor-ew-resize',
      w: 'inset-y-3 left-0 w-1.5 cursor-ew-resize',
      ne: 'top-0 right-0 size-3 cursor-nesw-resize',
      nw: 'top-0 left-0 size-3 cursor-nwse-resize',
      se: 'right-0 bottom-0 size-4 cursor-nwse-resize',
      sw: 'bottom-0 left-0 size-3 cursor-nesw-resize',
    } satisfies Record<ResizeEdge, string>,
  },
});

export interface DialogResizeEdgesProps {
  readonly handlers: DragHandlers;
}

export function DialogResizeEdges({ handlers }: DialogResizeEdgesProps): React.ReactElement {
  return (
    <>
      {RESIZE_EDGES.map((edge) => (
        <div
          key={edge}
          aria-hidden
          data-edge={edge}
          title={t('ui.dialog.resize')}
          className={edgeHandle({ edge })}
          {...handlers}
        />
      ))}
    </>
  );
}
