import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useState } from 'react';

import { useModalPlacement } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { DialogChromeContext, type DialogChrome } from '@/components/ui/dialog-chrome';
import { DialogHeader } from '@/components/ui/dialog-header';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly children?: React.ReactNode;
}

interface Offset {
  readonly x: number;
  readonly y: number;
}

const CENTER: Offset = { x: 0, y: 0 };

function useConfirmOffset(open: boolean): {
  readonly offset: Offset;
  readonly move: DialogChrome['move'];
} {
  const [offset, setOffset] = useState(CENTER);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setOffset(CENTER);
  }

  const move = useDragFrom(
    (event: React.PointerEvent<HTMLElement>): Offset | null =>
      event.target instanceof Element && event.target.closest('button, input, select, label')
        ? null
        : offset,
    (from: Offset, dx: number, dy: number) => {
      setOffset({ x: from.x + dx, y: from.y + dy });
    },
  );
  return { offset, move };
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = t('common.cancel'),
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps): React.ReactElement {
  const placement = useModalPlacement({
    id: 'confirm',
    defaultMode: 'floating',
    open,
    size: 'sm',
    movable: false,
    embeddable: false,
    onClose: null,
  });
  const { container, backdropClassName, popupClassName, popupRef } = placement;
  const { offset, move } = useConfirmOffset(open);
  const chrome: DialogChrome = { ...placement.chrome, move };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal container={container}>
        <AlertDialog.Backdrop className={backdropClassName} />
        <AlertDialog.Popup
          ref={popupRef}
          className={popupClassName}
          style={{ transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)` }}
        >
          <DialogChromeContext.Provider value={chrome}>
            <DialogHeader
              heading={
                <AlertDialog.Title className="text-sm font-semibold">{title}</AlertDialog.Title>
              }
            />
            <div className="p-4">
              <AlertDialog.Description className="text-muted-foreground text-xs whitespace-pre-line">
                {description}
              </AlertDialog.Description>
              {children}

              <div className="mt-4 flex justify-end gap-2">
                <AlertDialog.Close className={dialogButton({ tone: 'secondary' })}>
                  {cancelLabel}
                </AlertDialog.Close>
                <button
                  type="button"
                  className={dialogButton({ tone: 'primary' })}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </DialogChromeContext.Provider>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
