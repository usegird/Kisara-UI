import { Dialog } from '@base-ui/react/dialog';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useCallback, useRef } from 'react';

import {
  DialogChromeContext,
  dialogOpening,
  type DialogChrome,
} from '@/components/ui/dialog-chrome';
import { DIALOG_ICON_CLASS, DIALOG_ZOOM_CLASS, DialogHeader } from '@/components/ui/dialog-header';
import { DialogResizeEdges } from '@/components/ui/dialog-resize-edges';
import { useDialogWindow } from '@/hooks/ui/use-dialog-window';
import { useDialogZoom } from '@/hooks/ui/use-dialog-zoom';
import { t } from '@/i18n';
import type { DialogMinSize, DialogMode } from '@/lib/dialog-rect';
import { cn } from '@/lib/utils';
import { OWN_ZOOM_MARK } from '@/lib/zoom-input';

export { DIALOG_HEADER_CLASS, DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';

const dialogPopup = cva(
  'bg-popover text-popover-foreground flex flex-col overflow-hidden rounded-lg border shadow-lg',
  {
    variants: {
      size: {
        narrow: 'fixed top-1/2 left-1/2 z-50 w-60 -translate-x-1/2 -translate-y-1/2',
        sm: 'fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
        smWide: 'fixed top-1/2 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2',
        smWideTop: 'fixed top-24 left-1/2 z-50 w-full max-w-xl -translate-x-1/2',
        document: `fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-full max-w-xl -translate-x-1/2
          -translate-y-1/2`,
        documentWide: `fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-full max-w-4xl -translate-x-1/2
          -translate-y-1/2`,
        md: 'fixed top-24 left-1/2 z-50 max-h-[70vh] w-full max-w-lg -translate-x-1/2',
        lg: 'fixed top-24 left-1/2 z-50 h-[70vh] w-full max-w-4xl -translate-x-1/2',
        xl: `fixed top-1/2 left-1/2 z-50 h-[90vh] w-[96vw] max-w-[120rem] -translate-x-1/2
          -translate-y-1/2`,
        placed: 'fixed z-50',
        embedded: 'pointer-events-auto absolute inset-0 z-10',
      },
    },
  },
);

const dialogNarrow = cva('', {
  variants: {
    fullOnNarrow: {
      false: '',
      true: `max-sm:inset-0 max-sm:h-auto max-sm:max-h-none max-sm:w-auto max-sm:max-w-none
        max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0`,
    },
  },
  defaultVariants: { fullOnNarrow: false },
});

const dialogScheme = cva('', {
  variants: { scheme: { auto: '', light: 'theme-light' } },
  defaultVariants: { scheme: 'auto' },
});

const dialogBackdrop = cva('bg-black/40', {
  variants: {
    mode: {
      floating: 'fixed inset-0 z-50',
      embedded: 'pointer-events-auto fixed inset-0 z-10',
    },
  },
});

function DialogCloseIcon(): React.ReactElement {
  return (
    <Dialog.Close
      className={DIALOG_ICON_CLASS}
      aria-label={t('common.close')}
      title={t('common.close')}
    >
      <X className="size-4" aria-hidden />
    </Dialog.Close>
  );
}

type DialogSize =
  'narrow' | 'sm' | 'smWide' | 'smWideTop' | 'document' | 'documentWide' | 'md' | 'lg' | 'xl';

const SMALL_SIZES: readonly DialogSize[] = ['narrow', 'sm', 'smWide', 'smWideTop'];

interface ModalPlacementOptions {
  readonly id: string;
  readonly defaultMode: DialogMode;
  readonly open: boolean;
  readonly size: DialogSize;
  readonly movable: boolean;
  readonly embeddable?: boolean | undefined;
  readonly minSize?: DialogMinSize | undefined;
  readonly onClose: (() => void) | null;
}

interface ModalPlacement {
  readonly container: HTMLElement | undefined;
  readonly popupClassName: string;
  readonly backdropClassName: string;
  readonly embedded: boolean;
  readonly style: React.CSSProperties | undefined;
  readonly popupRef: (element: HTMLDivElement | null) => void;
  readonly chrome: DialogChrome;
  readonly edges: React.ReactNode;
  readonly zIndex: number | undefined;
  readonly raise: () => void;
}

export function useModalPlacement({
  id,
  defaultMode,
  open,
  size,
  movable,
  embeddable = true,
  minSize,
  onClose,
}: ModalPlacementOptions): ModalPlacement {
  const { placement, mode, host, toggle, zIndex, raise } = useDialogWindow({
    id,
    defaultMode,
    open,
    embeddable,
    minSize,
    onClose,
  });
  const moving = mode === 'floating' && movable;

  const chrome: DialogChrome = {
    mode,
    onToggleMode: embeddable ? toggle : null,
    move: moving ? placement.move : null,
  };
  return {
    container: mode === 'embedded' ? (host ?? undefined) : undefined,
    popupClassName: cn(
      dialogPopup({
        size: popupSizeOf(mode, moving && placement.placed, size),
      }),
      dialogOpening({ mode }),
    ),
    backdropClassName: dialogBackdrop({ mode }),
    embedded: mode === 'embedded',
    style: moving ? placement.style : undefined,
    popupRef: placement.popupRef,
    chrome,
    edges: moving ? <DialogResizeEdges handlers={placement.resize} /> : null,
    zIndex,
    raise,
  };
}

const BODY_FIELD_SELECTOR =
  ':scope > :not([data-dialog-header]) :is(input:not([type=hidden], [type=checkbox], ' +
  '[type=radio], [type=range]), textarea)';

export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;

export interface DialogFrameProps {
  readonly id: string;
  readonly defaultMode?: DialogMode | undefined;
  readonly movable?: boolean | undefined;
  readonly modal?: boolean | undefined;
  readonly embeddable?: boolean | undefined;
  readonly minSize?: DialogMinSize | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly size: DialogSize;
  readonly title: React.ReactNode;
  readonly leading?: React.ReactNode | undefined;
  readonly subtitle?: React.ReactNode | undefined;
  readonly description?: React.ReactNode | undefined;
  readonly header?: React.ReactNode | undefined;
  readonly actions?: React.ReactNode | undefined;
  readonly initialFocus?: React.RefObject<HTMLElement | null> | undefined;
  readonly finalFocus?: React.RefObject<HTMLElement | null> | undefined;
  readonly trigger?: React.ReactNode | undefined;
  readonly onKeyDown?: React.KeyboardEventHandler<HTMLDivElement> | undefined;
  readonly scheme?: 'auto' | 'light' | undefined;
  readonly fullOnNarrow?: boolean | undefined;
  readonly children: React.ReactNode;
}

export function DialogFrame({
  id,
  defaultMode = 'floating',
  movable = false,
  modal = true,
  embeddable,
  minSize,
  open,
  onOpenChange,
  size,
  title,
  leading,
  subtitle,
  description,
  header,
  actions,
  initialFocus,
  finalFocus,
  trigger,
  onKeyDown,
  scheme,
  fullOnNarrow,
  children,
}: DialogFrameProps): React.ReactElement {
  const placement = useModalPlacement({
    id,
    defaultMode,
    open,
    size,
    movable,
    embeddable: embeddable ?? !SMALL_SIZES.includes(size),
    minSize,
    onClose: () => onOpenChange(false),
  });
  const popup = useRef<HTMLDivElement | null>(null);
  const placementRef = placement.popupRef;
  const { attachZoom, zoom } = useDialogZoom();
  const setPopup = useCallback(
    (element: HTMLDivElement | null) => {
      popup.current = element;
      placementRef(element);
      attachZoom(element);
    },
    [placementRef, attachZoom],
  );
  const firstField = (): HTMLElement | true =>
    popup.current?.querySelector<HTMLElement>(BODY_FIELD_SELECTOR) ?? true;

  return (
    <Dialog.Root
      open={open}
      modal={modal}
      disablePointerDismissal={!modal}
      onOpenChange={(next) => onOpenChange(next)}
    >
      {trigger}
      <Dialog.Portal container={placement.container}>
        {modal ? (
          <Dialog.Backdrop
            data-dialog-backdrop
            className={placement.backdropClassName}
            onClick={placement.embedded ? () => onOpenChange(false) : undefined}
          />
        ) : null}
        <Dialog.Popup
          ref={setPopup}
          className={dialogScheme({
            scheme,
            className: cn(placement.popupClassName, dialogNarrow({ fullOnNarrow })),
          })}
          style={
            modal || placement.zIndex === undefined
              ? placement.style
              : { ...placement.style, zIndex: placement.zIndex }
          }
          onPointerDownCapture={modal ? undefined : placement.raise}
          initialFocus={initialFocus ?? firstField}
          finalFocus={finalFocus}
          onKeyDown={onKeyDown}
          {...{ [OWN_ZOOM_MARK]: '' }}
        >
          <DialogChromeContext.Provider value={placement.chrome}>
            {placement.edges}
            <div className={DIALOG_ZOOM_CLASS} style={{ zoom }}>
              <DialogHeader
                leading={leading}
                heading={
                  header === undefined ? (
                    <Dialog.Title className="min-w-0 truncate text-sm font-semibold">
                      {title}
                    </Dialog.Title>
                  ) : (
                    <>
                      <Dialog.Title className="sr-only">{title}</Dialog.Title>
                      {header}
                    </>
                  )
                }
                subtitle={subtitle}
                actions={actions}
                close={<DialogCloseIcon />}
              />
              {description === undefined ? null : (
                <Dialog.Description className="text-muted-foreground px-4 pt-3 text-xs">
                  {description}
                </Dialog.Description>
              )}
              {children}
            </div>
          </DialogChromeContext.Provider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function popupSizeOf(
  mode: string,
  placed: boolean,
  size: DialogSize,
): DialogSize | 'embedded' | 'placed' {
  if (mode === 'embedded') return 'embedded';
  return placed ? 'placed' : size;
}
