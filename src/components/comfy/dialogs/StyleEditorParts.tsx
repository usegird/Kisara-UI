import { cva } from 'class-variance-authority';
import { Plus, RefreshCw } from 'lucide-react';

import { arrowSelect } from '@/components/ui/arrow-select';
import { CopyButton } from '@/components/ui/copy-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { field } from '@/components/ui/field';
import { refreshIcon } from '@/components/ui/refresh-icon';
import { textDragProps } from '@/components/ui/text-drag';
import type { Style } from '@/graph/styles';
import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import { t, type MessageKey } from '@/i18n';
import { placeEntry } from '@/lib/insert-motion';
import { useStylesStore } from '@/store/use-styles-store';

const TEXT_HEADINGS = {
  positive: { heading: 'styles.positiveText', copy: 'styles.copyPositive' },
  negative: { heading: 'styles.negativeText', copy: 'styles.copyNegative' },
} as const satisfies Record<string, { heading: MessageKey; copy: MessageKey }>;

const FIELD_CLASS = field({ size: 'sm', width: 'full' });

const SELECTED = { true: 'bg-accent', false: '' };

const newStyleItem = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs',
  { variants: { selected: SELECTED } },
);

const styleItem = cva('hover:bg-accent w-full truncate rounded px-2 py-1 text-left text-xs', {
  variants: { selected: SELECTED },
});

function TextHeading({
  kind,
  text,
}: {
  readonly kind: keyof typeof TEXT_HEADINGS;
  readonly text: string;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span>{t(TEXT_HEADINGS[kind].heading)}</span>
      <CopyButton iconOnly frameless text={text} label={t(TEXT_HEADINGS[kind].copy)} />
    </div>
  );
}

interface RefreshStylesButtonProps {
  readonly status: ReturnType<typeof useStylesStore.getState>['status'];
  readonly disabled: boolean;
  readonly onRefresh: () => void;
}

export function RefreshStylesButton({
  status,
  disabled,
  onRefresh,
}: RefreshStylesButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={DIALOG_ICON_CLASS}
      aria-label={t('styles.refresh')}
      title={t('styles.refreshTitle')}
      disabled={disabled || status === 'loading' || status === 'saving'}
      onClick={onRefresh}
    >
      <RefreshCw className={refreshIcon({ loading: status === 'loading' })} aria-hidden />
    </button>
  );
}

interface StyleListProps {
  readonly styles: readonly Style[];
  readonly selected: string | null;
  readonly field: ReturnType<typeof useTextFieldWhile>;
  readonly onPick: (name: string | null) => void;
}

export function StyleList({ styles, selected, field, onPick }: StyleListProps): React.ReactElement {
  return (
    <nav
      aria-label={t('styles.list')}
      className="min-h-0 flex-1 overflow-y-auto p-1"
      onKeyDown={(event) => arrowSelect(event, 'list')}
    >
      <button
        type="button"
        className={newStyleItem({ selected: selected === null })}
        aria-pressed={selected === null}
        onClick={() => onPick(null)}
      >
        <Plus className="size-3.5 shrink-0" aria-hidden />
        {t('styles.newStyle')}
      </button>
      {styles.map((style) => (
        <div key={style.name} {...textDragProps(style.prompt)}>
          <button
            type="button"
            className={styleItem({ selected: style.name === selected })}
            title={t('styles.itemTitle', { name: style.name })}
            aria-pressed={style.name === selected}
            onClick={() => onPick(style.name)}
            onDoubleClick={(event) => {
              if (field === null) return;
              placeEntry(field, style.prompt, event.currentTarget.getBoundingClientRect());
            }}
          >
            {style.name}
          </button>
        </div>
      ))}
    </nav>
  );
}

interface StyleFormProps {
  readonly draft: Style;
  readonly onPatch: (part: Partial<Style>) => void;
}

export function StyleForm({ draft, onPatch }: StyleFormProps): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
      <label className="flex flex-col gap-1 text-xs">
        {t('styles.name')}
        <input
          className={FIELD_CLASS}
          value={draft.name}
          aria-label={t('styles.nameLabel')}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </label>

      <div className="flex min-h-40 flex-1 flex-col gap-1 text-xs">
        <TextHeading kind="positive" text={draft.prompt} />
        <textarea
          className={`${FIELD_CLASS} min-h-32 flex-1 resize-y font-mono leading-snug`}
          value={draft.prompt}
          aria-label={t('styles.positiveText')}
          onChange={(event) => onPatch({ prompt: event.target.value })}
        />
      </div>

      <div className="flex min-h-28 flex-col gap-1 text-xs">
        <TextHeading kind="negative" text={draft.negative} />
        <textarea
          className={`${FIELD_CLASS} min-h-20 resize-y font-mono leading-snug`}
          value={draft.negative}
          aria-label={t('styles.negativeText')}
          onChange={(event) => onPatch({ negative: event.target.value })}
        />
      </div>
    </div>
  );
}

interface StyleFooterProps {
  readonly message: string | null;
  readonly saving: boolean;
  readonly canDelete: boolean;
  readonly canSave: boolean;
  readonly onDelete: () => void;
  readonly onSave: () => void;
}

export function StyleFooter({
  message,
  saving,
  canDelete,
  canSave,
  onDelete,
  onSave,
}: StyleFooterProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-t px-3 py-2 text-xs">
      {message === null ? null : (
        <span className="text-destructive min-w-0 truncate">{message}</span>
      )}

      <button
        type="button"
        className="border-input ml-auto shrink-0 rounded-md border px-2 py-1
          disabled:opacity-50"
        disabled={!canDelete || saving}
        onClick={onDelete}
      >
        {t('common.delete')}
      </button>
      <button
        type="button"
        className="bg-primary text-primary-foreground shrink-0 rounded-md px-3 py-1
          disabled:opacity-50"
        disabled={saving || !canSave}
        title={t('styles.saveTitle')}
        onClick={onSave}
      >
        {t(saving ? 'styles.saving' : 'common.save')}
      </button>
    </div>
  );
}
