import { cva } from 'class-variance-authority';
import { ExternalLink, PanelsTopLeft, X } from 'lucide-react';
import { useContext } from 'react';

import { DialogChromeContext } from '@/components/ui/dialog-chrome';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export const DIALOG_HEADER_CLASS =
  'bg-muted mb-0 box-content flex h-6 shrink-0 items-center gap-2 border-b px-3 py-1';
const dialogHeader = cva(DIALOG_HEADER_CLASS, {
  variants: { movable: { true: 'cursor-move touch-none', false: '' } },
});

export const DIALOG_ZOOM_CLASS = 'flex min-h-0 min-w-0 flex-1 flex-col';

export const DIALOG_ICON_CLASS =
  'text-muted-foreground hover:bg-muted hover:text-foreground rounded p-[3px] disabled:opacity-40';

export const DIALOG_TOGGLE_ON_CLASS =
  'aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:ring-border ' +
  'aria-pressed:ring-1';

function DialogModeSwitch(): React.ReactElement | null {
  const chrome = useContext(DialogChromeContext);
  if (chrome?.onToggleMode == null) return null;

  const toEmbedded = chrome.mode === 'floating';
  const label = toEmbedded ? t('ui.dialog.toDocked') : t('ui.dialog.toFloating');
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={label}
      title={toEmbedded ? t('ui.dialog.toDockedTitle') : t('ui.dialog.toFloatingTitle')}
      onClick={chrome.onToggleMode}
    >
      {toEmbedded ? (
        <PanelsTopLeft className="size-4" aria-hidden />
      ) : (
        <ExternalLink className="size-4" aria-hidden />
      )}
    </button>
  );
}

export interface DialogHeaderProps {
  readonly leading?: React.ReactNode | undefined;
  readonly heading?: React.ReactNode | undefined;
  readonly subtitle?: React.ReactNode | undefined;
  readonly actions?: React.ReactNode | undefined;
  readonly close?: React.ReactNode | undefined;
  readonly className?: string | undefined;
}

export function DialogHeader({
  leading,
  heading,
  subtitle,
  actions,
  close,
  className,
}: DialogHeaderProps): React.ReactElement {
  const chrome = useContext(DialogChromeContext);
  const move = chrome?.move ?? null;

  return (
    <div
      data-dialog-header
      {...move}
      className={cn(dialogHeader({ movable: move !== null }), className)}
    >
      {leading}
      {heading}
      {subtitle === undefined ? null : (
        <span className="text-muted-foreground min-w-0 truncate text-xs">{subtitle}</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {actions}
        <DialogModeSwitch />
        {close}
      </div>
    </div>
  );
}

export interface DialogCloseButtonProps {
  readonly onClose: () => void;
  readonly label?: string | undefined;
  readonly title?: string | undefined;
}

export function DialogCloseButton({
  onClose,
  label = t('common.close'),
  title = label,
}: DialogCloseButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={label}
      title={title}
      onClick={onClose}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
