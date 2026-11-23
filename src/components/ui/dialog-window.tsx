import { cva } from 'class-variance-authority';
import { useCallback } from 'react';
import { createPortal } from 'react-dom';

import {
  DialogChromeContext,
  dialogOpening,
  type DialogChrome,
} from '@/components/ui/dialog-chrome';
import { DIALOG_ZOOM_CLASS } from '@/components/ui/dialog-header';
import { DialogResizeEdges } from '@/components/ui/dialog-resize-edges';
import { useDialogWindow } from '@/hooks/ui/use-dialog-window';
import { useDialogZoom } from '@/hooks/ui/use-dialog-zoom';
import type { DialogMode } from '@/lib/dialog-rect';
import { cn } from '@/lib/utils';
import { OWN_ZOOM_MARK } from '@/lib/zoom-input';

const windowFrame = cva(
  'bg-popover text-popover-foreground flex flex-col overflow-hidden rounded-lg border shadow-lg',
  {
    variants: {
      place: {
        embedded: 'pointer-events-auto absolute inset-0',
        centered: 'fixed top-1/2 left-1/2 h-[80vh] w-[80vw] -translate-x-1/2 -translate-y-1/2',
        placed: 'fixed',
      },
    },
  },
);

export interface DialogWindowProps {
  readonly id: string;
  readonly label: string;
  readonly defaultMode?: DialogMode | undefined;
  readonly marks?: Readonly<Record<`data-${string}`, string>> | undefined;
  readonly floatable?: boolean | undefined;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}

export function DialogWindow({
  id,
  label,
  defaultMode = 'floating',
  marks,
  floatable = true,
  onClose,
  children,
}: DialogWindowProps): React.ReactElement | null {
  const { mode, host, visible, zIndex, placement, toggle, raise } = useDialogWindow({
    id,
    defaultMode,
    open: true,
    floatable,
    onClose,
  });
  const floating = mode === 'floating';
  const { popupRef, placed, style, move, resize } = placement;
  const { attachZoom, zoom } = useDialogZoom();
  const attachFrame = useCallback(
    (element: HTMLDivElement | null) => {
      popupRef(element);
      attachZoom(element);
    },
    [popupRef, attachZoom],
  );

  const chrome: DialogChrome = {
    mode,
    onToggleMode: floatable ? toggle : null,
    move: floating ? move : null,
    visible,
  };

  const frame = (
    <div
      {...marks}
      {...{ [OWN_ZOOM_MARK]: '' }}
      ref={attachFrame}
      role="region"
      aria-label={label}
      hidden={!visible}
      data-dialog-window={id}
      className={cn(
        windowFrame({ place: windowPlaceOf(floating, placed) }),
        dialogOpening({ mode }),
      )}
      style={floating ? { ...style, zIndex } : undefined}
      onPointerDownCapture={raise}
    >
      <DialogChromeContext.Provider value={chrome}>
        {floating ? <DialogResizeEdges handlers={resize} /> : null}
        <div className={DIALOG_ZOOM_CLASS} style={{ zoom }}>
          {children}
        </div>
      </DialogChromeContext.Provider>
    </div>
  );

  return createPortal(frame, floating || host === null ? document.body : host);
}

function windowPlaceOf(floating: boolean, placed: boolean): 'embedded' | 'placed' | 'centered' {
  if (!floating) return 'embedded';
  return placed ? 'placed' : 'centered';
}
