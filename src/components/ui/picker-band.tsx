import { cva } from 'class-variance-authority';
import { Folder, Pin, PinOff } from 'lucide-react';

import { CardHeightField } from '@/components/ui/card-height-field';
import { DecideButton, PaneCloseButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { SearchField } from '@/components/ui/search-field';
import { SortButtons, type SortOption } from '@/components/ui/sort-buttons';
import { t, type MessageKey } from '@/i18n';
import { cn } from '@/lib/utils';

const noticeText = cva('min-w-0 truncate', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

type DirectoryToggleState = 'hidden' | 'shown' | 'pinned';

const DIRECTORY_TOGGLE = {
  hidden: { Icon: Folder, label: 'modelPicker.directoryToggle.show' },
  shown: { Icon: Pin, label: 'modelPicker.directoryToggle.pin' },
  pinned: { Icon: PinOff, label: 'modelPicker.directoryToggle.unpin' },
} as const satisfies Record<string, { readonly Icon: typeof Folder; readonly label: MessageKey }>;

type PickerSortOption<K extends string> = SortOption<K>;

export interface PickerBandProps<K extends string> {
  readonly decideToolbar: string;
  readonly decideLabel: string;
  readonly decideTitle: string;
  readonly decideDisabled: boolean;
  readonly decideIcon: 'set' | 'insert';
  readonly decideCaption?: string | undefined;
  readonly onDecide: () => void;
  readonly directory?:
    | {
        readonly state: DirectoryToggleState;
        readonly onToggle: () => void;
      }
    | undefined;
  readonly actions?: React.ReactNode | undefined;
  readonly close?: { readonly label: string; readonly onClose: () => void } | undefined;
  readonly leadWidth?: number | undefined;
  readonly filterToolbar: string;
  readonly filterLabel: string;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly sortOptions: readonly PickerSortOption<K>[];
  readonly sortKey: K;
  readonly ascending: boolean;
  readonly onSort: (key: K, ascending: boolean) => void;
  readonly height: number;
  readonly notice: { readonly text: string; readonly failed: boolean } | null;
}

export function PickerBand<K extends string>({
  decideToolbar,
  decideLabel,
  decideTitle,
  decideDisabled,
  decideIcon,
  decideCaption,
  onDecide,
  directory,
  actions,
  close,
  leadWidth,
  filterToolbar,
  filterLabel,
  query,
  onQuery,
  sortOptions,
  sortKey,
  ascending,
  onSort,
  height,
  notice,
}: PickerBandProps<K>): React.ReactElement {
  return (
    <div className="flex shrink-0 overflow-hidden">
      <div
        className="min-w-max shrink-0 grow-0"
        style={leadWidth === undefined ? undefined : { flexBasis: leadWidth, flexShrink: 1 }}
      >
        <DialogToolbar label={decideToolbar}>
          <DecideButton
            label={decideLabel}
            icon={decideIcon}
            caption={decideCaption}
            title={decideTitle}
            disabled={decideDisabled}
            onClick={onDecide}
          />
          {actions}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {directory === undefined ? null : <DirectoryToggle {...directory} />}
            {close === undefined ? null : (
              <PaneCloseButton label={close.label} onClick={close.onClose} />
            )}
          </span>
        </DialogToolbar>
      </div>
      <div className="min-w-0 shrink-[0.001] grow basis-auto">
        <DialogToolbar label={filterToolbar}>
          <SearchField
            autoFocus
            value={query}
            onChange={onQuery}
            label={filterLabel}
            placeholder={t('modelPicker.filter.placeholder')}
          />
          <SortButtons
            options={sortOptions}
            sortKey={sortKey}
            ascending={ascending}
            onSort={onSort}
          />

          <CardHeightField height={height} />

          {notice === null ? null : (
            <span className={noticeText({ failed: notice.failed })} title={notice.text}>
              {notice.text}
            </span>
          )}
        </DialogToolbar>
      </div>
    </div>
  );
}

export function DirectoryToggle({
  state,
  onToggle,
}: {
  readonly state: DirectoryToggleState;
  readonly onToggle: () => void;
}): React.ReactElement {
  const toggle = DIRECTORY_TOGGLE[state];
  return (
    <button
      type="button"
      data-directory-toggle=""
      className={cn(DIALOG_ICON_CLASS, 'shrink-0')}
      aria-label={t(toggle.label)}
      title={t(toggle.label)}
      aria-pressed={state !== 'hidden'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <toggle.Icon className="size-4" aria-hidden />
    </button>
  );
}
