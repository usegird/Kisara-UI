import { ArrowDownToLine, ArrowLeftToLine, Check, X } from 'lucide-react';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const DECIDE_BUTTON_CLASS = `bg-primary text-primary-foreground flex shrink-0 items-center gap-1
  rounded-md px-2 py-0.5 disabled:opacity-40`;

export interface DecideButtonProps {
  readonly label: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly caption?: string | undefined;
  readonly icon?: 'insert' | 'set' | 'apply' | undefined;
}

const DECIDE_ICONS = { insert: ArrowLeftToLine, set: ArrowDownToLine, apply: Check } as const;

export function DecideButton({
  label,
  title,
  disabled,
  onClick,
  caption = t('ui.decide.caption'),
  icon = 'insert',
}: DecideButtonProps): React.ReactElement {
  const Icon = DECIDE_ICONS[icon];

  return (
    <button
      type="button"
      className={DECIDE_BUTTON_CLASS}
      aria-label={label}
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="size-3" aria-hidden />
      <span>{caption}</span>
    </button>
  );
}

export function PaneCloseButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={cn(DIALOG_ICON_CLASS, 'ml-auto shrink-0')}
      aria-label={label}
      title={t('common.close')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
