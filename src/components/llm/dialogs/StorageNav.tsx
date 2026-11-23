import { cva } from 'class-variance-authority';
import { ChevronRight, Database, RefreshCw } from 'lucide-react';

import {
  allBackupsOf,
  COMFY_BACKUP,
  GROUPS,
  INDEXED_DB,
  INDEXED_DB_IDS,
  isBrowserEntry,
  membersOf,
  OVERVIEW,
  TOP_IDS,
  type Entry,
} from '@/components/llm/dialogs/storage-entries';
import { markCounts, type Marks } from '@/components/llm/dialogs/storage-marks';
import { BUTTON, RIGHT_MIN } from '@/components/llm/dialogs/storage-style';
import { DecideButton } from '@/components/ui/decide-button';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { PaneDivider } from '@/components/ui/pane-divider';
import { DirectoryToggle } from '@/components/ui/picker-band';
import { t } from '@/i18n';
import { reloadPage } from '@/lib/reload-page';
import { formatBytes } from '@/lib/text';
import { totalOf, type StorageItem } from '@/store/persist/storage-usage';

const entryClass = cva(
  'hover:bg-accent flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs',
  {
    variants: {
      active: { true: 'bg-accent', false: '' },
      indent: { true: 'pl-4', false: 'pl-2' },
    },
  },
);

const navLabel = cva('min-w-0 flex-1 truncate', {
  variants: { heading: { true: 'font-medium', false: '' } },
});

const NAV_SIZE = 'text-muted-foreground shrink-0 text-2xs tabular-nums @max-[8.5rem]:hidden';

export interface StorageBandProps {
  readonly leadStyle: React.CSSProperties | undefined;
  readonly applyDisabled: boolean;
  readonly onApply: () => void;
  readonly directory: 'pinned' | 'shown' | 'hidden';
  readonly onDirectory: () => void;
  readonly path: readonly { readonly id: string; readonly label: string }[];
  readonly onSelect: (id: string) => void;
  readonly header: React.ReactNode;
  readonly onReload: () => void;
}

export function StorageBand({
  leadStyle,
  applyDisabled,
  onApply,
  directory,
  onDirectory,
  path,
  onSelect,
  header,
  onReload,
}: StorageBandProps): React.ReactElement {
  return (
    <div className="flex shrink-0 overflow-hidden">
      <div className="min-w-max shrink-0 grow-0" style={leadStyle}>
        <DialogToolbar label={t('llm.storage.leadToolbar')}>
          <DecideButton
            icon="apply"
            caption={t('llm.storage.apply')}
            label={t('llm.storage.apply')}
            title={t('llm.storage.applyHint')}
            disabled={applyDisabled}
            onClick={onApply}
          />
          <DirectoryToggle state={directory} onToggle={onDirectory} />
        </DialogToolbar>
      </div>
      <div className="grow basis-0" style={{ minWidth: RIGHT_MIN }}>
        <DialogToolbar label={t('llm.storage.itemsToolbar')}>
          <Breadcrumb path={path} onSelect={onSelect} />
          <span className="ml-auto" />
          {header}
          <button
            type="button"
            className={`${DIALOG_ICON_CLASS} shrink-0`}
            aria-label={t('llm.storage.reload')}
            title={t('llm.storage.reload')}
            onClick={onReload}
          >
            <RefreshCw className="size-4" aria-hidden />
          </button>
        </DialogToolbar>
      </div>
    </div>
  );
}

export function NavOverlay({
  ref,
  width,
  onResize,
  children,
}: {
  readonly ref: React.Ref<HTMLDivElement>;
  readonly width: number;
  readonly onResize: (next: number) => void;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      ref={ref}
      className="bg-popover animate-in slide-in-from-left absolute inset-y-0 left-0 z-30
        flex shadow-lg animation-duration-150 motion-reduce:animate-none"
    >
      <div className="flex min-h-0 flex-col" style={{ width }}>
        {children}
      </div>
      <PaneDivider
        label={t('llm.storage.categories')}
        size={width}
        side="left"
        onResize={onResize}
      />
    </div>
  );
}

export function ReloadNotice(): React.ReactElement {
  return (
    <div className="bg-muted/60 flex items-center gap-2 border-b px-3 py-1.5">
      <span className="min-w-0 flex-1">{t('llm.storage.pendingReload')}</span>
      <button type="button" className={BUTTON} onClick={reloadPage}>
        {t('llm.storage.reloadPage')}
      </button>
    </div>
  );
}

function Breadcrumb({
  path,
  onSelect,
}: Pick<StorageBandProps, 'path' | 'onSelect'>): React.ReactElement {
  return (
    <nav aria-label={t('llm.storage.breadcrumb')} className="flex min-w-0 items-center gap-0.5">
      {path.map((crumb, index) => {
        const onCrumbClick = (): void => onSelect(crumb.id);
        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
            {index === 0 ? null : (
              <ChevronRight className="text-muted-foreground size-3 shrink-0" aria-hidden />
            )}
            {index === path.length - 1 ? (
              <span className="truncate font-medium" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground truncate hover:underline"
                onClick={onCrumbClick}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export interface CategoryNavProps {
  readonly entries: readonly Entry[];
  readonly selected: string;
  readonly marks: Marks;
  readonly onSelect: (id: string) => void;
}

export function CategoryNav({
  entries,
  selected,
  marks,
  onSelect,
}: CategoryNavProps): React.ReactElement {
  const line = (
    id: string,
    label: string,
    items: readonly StorageItem[] | null,
    options: { readonly indent: boolean; readonly heading: boolean; readonly hint?: string },
  ): React.ReactElement => {
    const onLineClick = (): void => onSelect(id);
    return (
      <button
        key={id}
        type="button"
        className={entryClass({ active: selected === id, indent: options.indent })}
        aria-pressed={selected === id}
        title={options.hint}
        onClick={onLineClick}
      >
        <span className={navLabel({ heading: options.heading })}>{label}</span>
        <MarkCount entry={entries.find((item) => item.id === id)} marks={marks} />
        <span className={NAV_SIZE}>{items === null ? '—' : formatBytes(totalOf(items))}</span>
      </button>
    );
  };
  const row = (entry: Entry, indent: boolean): React.ReactElement =>
    line(entry.id, entry.label, entry.remote === null ? entry.items : null, {
      indent,
      heading: false,
      hint: entry.hint,
    });
  const onOverviewClick = (): void => onSelect(OVERVIEW);
  return (
    <nav
      aria-label={t('llm.storage.categories')}
      className="@container min-h-0 flex-1 overflow-y-auto p-1"
    >
      <button
        type="button"
        className={entryClass({ active: selected === OVERVIEW, indent: false })}
        aria-pressed={selected === OVERVIEW}
        onClick={onOverviewClick}
      >
        <Database className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-medium">{t('llm.storage.overview')}</span>
      </button>
      {line(
        INDEXED_DB,
        t('llm.storage.indexedDb'),
        membersOf(INDEXED_DB_IDS, entries).flatMap((entry) => entry.items),
        { indent: true, heading: false },
      )}
      {membersOf(TOP_IDS, entries).map((entry) => row(entry, true))}
      {line(COMFY_BACKUP, t('llm.storage.comfyBackup'), allBackupsOf(entries), {
        indent: true,
        heading: false,
      })}
      {GROUPS.map((group) => {
        const members = membersOf(group.ids, entries);
        return (
          <div key={group.id} className="mt-2">
            {line(
              group.id,
              t(group.label),
              members.filter(isBrowserEntry).flatMap((entry) => entry.items),
              {
                indent: false,
                heading: true,
              },
            )}
            {members.map((entry) => row(entry, true))}
          </div>
        );
      })}
    </nav>
  );
}

function MarkCount({
  entry,
  marks,
}: {
  readonly entry: Entry | undefined;
  readonly marks: Marks;
}): React.ReactElement | null {
  if (entry === undefined) return null;
  const { plus, minus } = markCounts(entry, marks);
  if (plus === 0 && minus === 0) return null;
  return (
    <span className="flex shrink-0 gap-1 text-2xs tabular-nums" aria-hidden>
      {plus === 0 ? null : <span className="text-success">+{plus}</span>}
      {minus === 0 ? null : <span className="text-destructive">−{minus}</span>}
    </span>
  );
}
