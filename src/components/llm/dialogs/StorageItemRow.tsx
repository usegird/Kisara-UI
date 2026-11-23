import { cva } from 'class-variance-authority';
import { ArrowRight, Trash2, Undo2 } from 'lucide-react';

import { readReferenceValue } from '@/components/llm/dialogs/storage-actions';
import {
  approxEm,
  formatSavedTime,
  hasReference,
  KEY_TEXT,
  rowTextOf,
  type Entry,
  type Row,
} from '@/components/llm/dialogs/storage-entries';
import { markKey, type Mark, type Marks } from '@/components/llm/dialogs/storage-marks';
import {
  BACKUP_CELL,
  deleteIcon,
  ICON_SPACER,
  MARKED,
  ROW_GRID,
} from '@/components/llm/dialogs/storage-style';
import { RawButton } from '@/components/llm/dialogs/StorageRawButton';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { formatBytes } from '@/lib/text';
import { isClearable, readStorageRaw, type StorageItem } from '@/store/persist/storage-usage';

const GAP_EM = 0.67;

const NAME_SHOWN = 0.7;

const TAKE_BUTTON =
  'text-muted-foreground hover:text-foreground hover:bg-muted flex shrink-0 items-center gap-1 ' +
  'rounded px-1 text-2xs disabled:opacity-40';

const BROWSER_CELL = 'col-start-1 flex min-w-0 flex-wrap items-center gap-x-2';
const BROWSER_TAIL = 'ml-auto flex items-center gap-0.5';
const NAME_GROUP = 'flex min-w-0 grow items-center gap-x-2';
const rowName = cva('flex min-w-0 shrink grow basis-0 flex-col [contain:inline-size]', {
  variants: { marked: MARKED },
});
const factText = cva('text-muted-foreground whitespace-nowrap tabular-nums', {
  variants: { marked: MARKED },
});

const restoreIcon = cva(`${DIALOG_ICON_CLASS} shrink-0`, {
  variants: { marked: { true: 'bg-muted text-primary', false: '' } },
});

export interface ItemRowProps {
  readonly row: Row;
  readonly entry: Entry;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
  readonly onTake: (() => void) | undefined;
}

export function ItemRow({
  row,
  entry,
  marks,
  busy,
  onToggle,
  onTake,
}: ItemRowProps): React.ReactElement {
  const { browser } = row;
  const { name, size } = rowTextOf(row);
  const browserMark: Mark = { entryId: entry.id, side: 'browser', key: row.key };
  const browserMarked = marks.has(markKey(browserMark));
  const onBrowserToggle = (): void => onToggle(browserMark);
  const loadBrowserRaw = (): Promise<unknown> => readStorageRaw(entry.category, row.key);
  const takeButton =
    onTake === undefined ? null : (
      <button
        type="button"
        className={TAKE_BUTTON}
        disabled={busy}
        aria-label={t('llm.storage.takeBackupLabel', { name })}
        title={t('llm.storage.takeBackupLabel', { name })}
        onClick={guardPress(`storage-take:${entry.id}:${row.key}`, onTake)}
      >
        <ArrowRight className="size-3.5" aria-hidden />
        {t('llm.storage.takeBackup')}
      </button>
    );
  return (
    <li className={`${ROW_GRID} py-1 leading-[22px]`}>
      <div className={BROWSER_CELL}>
        <div
          className={NAME_GROUP}
          style={{
            flexBasis: `${(approxEm(name) * NAME_SHOWN + approxEm(size) + GAP_EM).toFixed(2)}em`,
          }}
        >
          <div className={rowName({ marked: browserMarked })}>
            <span className="truncate" title={row.key}>
              {name}
            </span>
            {browser?.known == null ? null : (
              <span className="text-muted-foreground text-2xs">
                {t(KEY_TEXT[browser.known][1])}
              </span>
            )}
          </div>
          {browser === null ? null : (
            <span className={factText({ marked: browserMarked })}>{size}</span>
          )}
        </div>
        {browser === null ? null : (
          <>
            <span className={BROWSER_TAIL}>
              {browser.updatedAt === null ? null : (
                <span className={`${factText({ marked: browserMarked })} mr-2`}>
                  {formatSavedTime(browser.updatedAt)}
                </span>
              )}
              <RawButton label={t('llm.storage.raw', { name })} load={loadBrowserRaw} />
              {isClearable(entry.category) ? (
                <DeleteToggle
                  marked={browserMarked}
                  busy={busy}
                  name={name}
                  onToggle={onBrowserToggle}
                />
              ) : (
                <span className={ICON_SPACER} />
              )}
            </span>
          </>
        )}
      </div>

      {!hasReference(entry) ? null : (
        <span className={BACKUP_CELL}>
          {row.backup === null ? (
            takeButton
          ) : (
            <BackupFacts
              entry={entry}
              rowKey={row.key}
              item={row.backup}
              name={name}
              marks={marks}
              busy={busy}
              onToggle={onToggle}
            />
          )}
        </span>
      )}
    </li>
  );
}

function BackupFacts({
  entry,
  rowKey,
  item,
  name,
  marks,
  busy,
  onToggle,
}: {
  readonly entry: Entry;
  readonly rowKey: string;
  readonly item: StorageItem;
  readonly name: string;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
}): React.ReactElement {
  const backupMark: Mark = { entryId: entry.id, side: 'backup', key: rowKey };
  const restoreMark: Mark = { entryId: entry.id, side: 'restore', key: rowKey };
  const backupMarked = marks.has(markKey(backupMark));
  const restoreMarked = marks.has(markKey(restoreMark));
  const { file } = entry;
  const loadReference = (): Promise<unknown> => readReferenceValue(entry, rowKey);
  const onRestoreClick = (): void => onToggle(restoreMark);
  const onBackupDeleteClick = (): void => onToggle(backupMark);
  const restoreLabel = t(restoreMarked ? 'llm.storage.unrollback' : 'llm.storage.rollback', {
    name,
  });
  const backupDeleteLabel = t(
    backupMarked ? 'llm.storage.unmarkBackup' : 'llm.storage.deleteBackup',
    { name },
  );
  return (
    <>
      {item.updatedAt === null ? null : (
        <span className={factText({ marked: backupMarked })}>
          {formatSavedTime(item.updatedAt)}
        </span>
      )}
      <span className="flex flex-[1_1_auto] items-center gap-0.5">
        <span className={factText({ marked: backupMarked })}>{formatBytes(item.bytes)}</span>
        <span className="ml-auto pl-2" />
        <RawButton
          label={t(file === null ? 'llm.storage.rawBackup' : 'llm.storage.rawFile', {
            name,
          })}
          load={loadReference}
        />
        <button
          type="button"
          className={restoreIcon({ marked: restoreMarked })}
          disabled={busy}
          aria-pressed={restoreMarked}
          aria-label={restoreLabel}
          title={restoreLabel}
          onClick={onRestoreClick}
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        {file !== null ? null : (
          <button
            type="button"
            className={deleteIcon({ marked: backupMarked })}
            disabled={busy}
            aria-pressed={backupMarked}
            aria-label={backupDeleteLabel}
            title={backupDeleteLabel}
            onClick={onBackupDeleteClick}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </span>
    </>
  );
}

export function DeleteToggle({
  marked,
  busy,
  name,
  onToggle,
  className = '',
}: {
  readonly marked: boolean;
  readonly busy: boolean;
  readonly name: string;
  readonly onToggle: () => void;
  readonly className?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${deleteIcon({ marked })} ${className}`}
      disabled={busy}
      aria-pressed={marked}
      aria-label={
        marked ? `${t('llm.storage.unmark')} ${name}` : `${t('llm.storage.clear')} ${name}`
      }
      title={marked ? t('llm.storage.unmark') : t('llm.storage.clear')}
      onClick={onToggle}
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}
