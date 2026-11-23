import { cva } from 'class-variance-authority';
import { Play } from 'lucide-react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';

const summaryText = cva('min-w-0 flex-1 truncate font-normal text-muted-foreground', {
  variants: { struck: { true: 'line-through', false: '' } },
});

const labelText = cva('max-w-[60%] shrink-0 truncate font-medium', {
  variants: { struck: { true: 'line-through', false: '' } },
});

const triangle = cva('size-2.5 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

const ACTIONS = 'absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-1';
const tokenCount = cva('text-muted-foreground shrink-0 pr-1 tabular-nums', {
  variants: {
    covered: {
      true: 'group-focus-within/card:invisible group-hover/card:invisible',
      false: '',
    },
  },
});

export interface CardHeaderProps {
  readonly label: string;
  readonly position: string | null;
  readonly tokens: React.ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onRename?: ((name: string) => void) | undefined;
  readonly defaultLabel?: string | undefined;
  readonly startRenaming?: boolean | undefined;
  readonly onRenameEnd?: (() => void) | undefined;
  readonly summary: string;
  readonly actions?: React.ReactNode;
  readonly grip?: React.ReactNode;
  readonly struck?: boolean | undefined;
}

export function CardHeader({
  label,
  position,
  tokens,
  open,
  onToggle,
  summary,
  onRename,
  defaultLabel,
  startRenaming = false,
  onRenameEnd,
  actions,
  grip,
  struck = false,
}: CardHeaderProps): React.ReactElement {
  const [renaming, setRenaming] = useState(startRenaming);
  const cancelled = useRef(false);
  const selected = useRef(false);
  const attachName = (element: HTMLInputElement | null): void => {
    if (element === null || selected.current) return;
    selected.current = true;
    element.focus();
    element.select();
  };
  return (
    <div className="relative flex min-w-0 items-center gap-1">
      {grip}
      {renaming && onRename !== undefined ? (
        <input
          ref={attachName}
          className="border-input bg-background min-w-0 flex-1 rounded-sm border px-1 font-medium"
          defaultValue={label === defaultLabel ? '' : label}
          placeholder={defaultLabel}
          aria-label={t('llm.prompt.rename')}
          onKeyDown={(event) => {
            const key = entryKeyOf(event);
            if (key === 'commit') event.currentTarget.blur();
            if (key === 'cancel') {
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            if (!cancelled.current) onRename(event.currentTarget.value.trim());
            cancelled.current = false;
            selected.current = false;
            setRenaming(false);
            onRenameEnd?.();
          }}
        />
      ) : (
        <button
          type="button"
          className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1
            text-left"
          aria-expanded={open}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'F2' && onRename !== undefined) {
              event.preventDefault();
              setRenaming(true);
            }
          }}
        >
          <Play className={triangle({ open })} aria-hidden />
          <span
            className={labelText({ struck })}
            title={onRename === undefined ? undefined : t('llm.prompt.renameHint')}
            onDoubleClick={() => {
              if (onRename !== undefined) setRenaming(true);
            }}
          >
            {label}
          </span>
          {open || summary.length === 0 ? (
            <span className="flex-1" />
          ) : (
            <span className={summaryText({ struck })}>{summary}</span>
          )}
          {position === null ? null : (
            <span className="text-muted-foreground shrink-0 text-3xs">{position}</span>
          )}
          {tokens === undefined ? null : (
            <span className={tokenCount({ covered: actions !== undefined && actions !== null })}>
              {tokens}
            </span>
          )}
        </button>
      )}
      {actions === undefined || actions === null ? null : <div className={ACTIONS}>{actions}</div>}
    </div>
  );
}
