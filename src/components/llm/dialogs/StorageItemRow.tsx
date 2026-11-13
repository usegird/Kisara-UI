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

// ─────────────────────────────
// ストレージの管理の右の列の 1 件。ブラウザの欄とバックアップの欄、削除の印と生データのアイコン。
// 印は一覧の持ち主（ダイアログ）が持ち、ここは描いて押したことを返すだけ。
// ─────────────────────────────

/** 名前と大きさの間（`gap-x-2` の 0.5rem を、文字の大きさ 0.75rem の em にした値） */
const GAP_EM = 0.67;

/** 名前の 3 割が隠れたら時刻を回り込ませる（名前の伸びる基をこの割合にする） */
const NAME_SHOWN = 0.7;

/** バックアップの欄の「→ バックアップ取得」（控えの無い 1 件） */
const TAKE_BUTTON =
  'text-muted-foreground hover:text-foreground hover:bg-muted flex shrink-0 items-center gap-1 ' +
  'rounded px-1 text-2xs disabled:opacity-40';

/** ブラウザの欄。名前・大きさ・組（時刻とアイコン）を 1 行に並べ、狭ければ組を下の行の右へ回す */
const BROWSER_CELL = 'col-start-1 flex min-w-0 flex-wrap items-center gap-x-2';
/** 時刻とアイコンの組。右に寄せ、時刻はどの行も同じ幅なので左端も揃う */
const BROWSER_TAIL = 'ml-auto flex items-center gap-0.5';
/**
 * 名前と大きさの組。いつも 1 行に並べ、並べきれなければ名前を「…」で縮める（大きさは隠さない）。
 * 伸びる基を名前の長さの 7 割（見積もり）と大きさにし、それより狭ければ時刻とアイコンの組が下へ回る
 */
const NAME_GROUP = 'flex min-w-0 grow items-center gap-x-2';
/**
 * ブラウザの欄の名前。名前の長さは列の下限に数えない（`contain: inline-size`）ので、ブラウザの欄の下限は
 * 大きさ、または時刻とアイコンを並べた幅になり、バックアップの境目の線がアイコンに重ならない
 */
const rowName = cva('flex min-w-0 shrink grow basis-0 flex-col [contain:inline-size]', {
  variants: { marked: MARKED },
});
/** 時刻・大きさの文字。削除の印を付けたら取り消し線 */
const factText = cva('text-muted-foreground whitespace-nowrap tabular-nums', {
  variants: { marked: MARKED },
});

/** 戻すアイコン。印を付けているときは入っている見た目にする */
const restoreIcon = cva(`${DIALOG_ICON_CLASS} shrink-0`, {
  variants: { marked: { true: 'bg-muted text-primary', false: '' } },
});

/** 右の列の 1 件の props */
export interface ItemRowProps {
  readonly row: Row;
  readonly entry: Entry;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
  /** バックアップを取る。取れない行（控えがある・つないでいない・ファイルを開いている）は無し */
  readonly onTake: (() => void) | undefined;
}

/** 右の列の 1 件。左にブラウザの欄、バックアップの列があれば右端に欄と境目の線 */
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
      {/* ブラウザの欄。名前・大きさの後に、時刻とアイコンの組を並べる。名前の 3 割が隠れるほど狭ければ、
          組が名前・大きさの下へ回る（大きさがアイコンの上に来る）。バックアップにだけある行は名前だけ */}
      <div className={BROWSER_CELL}>
        <div
          className={NAME_GROUP}
          // 伸びる基を名前の長さの 7 割と大きさにし、それと組が入らなければ組を下へ回す
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

      {/* バックアップの欄（控えを書く種類・ファイルを開いている種類）。時刻・大きさ・生データ・戻す・削除
          （ファイルは削除なし）。無い 1 件・つないでいないときも欄と境目の線は出す。足りなければ大きさと
          アイコンが時刻の下へ回る */}
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

/** バックアップの欄の中身。時刻・大きさと、生データ・戻す・削除（ファイルは削除なし）のアイコン */
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
      {/* 大きさ（左寄せ）とアイコン（右寄せ）は 1 つの組にし、回り込むときも一緒に回る */}
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

/** ブラウザの欄の削除アイコン。印を付けるだけで、もう一度押すと外す */
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
