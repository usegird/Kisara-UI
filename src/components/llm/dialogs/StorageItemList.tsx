import { cva } from 'class-variance-authority';
import { FolderOpen, X } from 'lucide-react';
import { useRef } from 'react';

import { exportEntry } from '@/components/llm/dialogs/storage-actions';
import {
  backupInfoOf,
  backupsOf,
  figures,
  hasReference,
  isBrowserEntry,
  itemName,
  KEY_TEXT,
  REMOTE_TEXT,
  rowsOf,
  type Entry,
  type Row,
} from '@/components/llm/dialogs/storage-entries';
import { markKey, type Mark, type Marks } from '@/components/llm/dialogs/storage-marks';
import {
  BACKUP_CELL,
  BUTTON,
  ICON_SPACER,
  MARKED,
  ROW_GRID,
} from '@/components/llm/dialogs/storage-style';
import { DeleteToggle, ItemRow } from '@/components/llm/dialogs/StorageItemRow';
import { RawButton } from '@/components/llm/dialogs/StorageRawButton';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { formatBytes } from '@/lib/text';
import { canExport } from '@/store/persist/storage-export';
import { isClearable, readStorageRaw } from '@/store/persist/storage-usage';

// ─────────────────────────────
// ストレージの管理の右の列の、選んだ種類の 1 件ずつと帯の種類ごとの操作。
// 印と開いたファイルはダイアログが持ち、ここは描いて押したことを返すだけ。
// ─────────────────────────────

// 1 件ずつの一覧は、行が列を分け合う格子（subgrid）にし、見出しと行の境目の線を縦に揃える。
// 列は ブラウザ（名前・大きさ・時刻・生データ・削除）とバックアップ（バックアップする種類だけ）。
// 幅が足りなくなり、名前の 3 割が隠れるほどになると、ブラウザの時刻とアイコンが名前・大きさの下へ回り込む
// （大きさがアイコンの上に来る）。さらに足りなければ、バックアップの欄は時刻の下に大きさ（左寄せ）と
// アイコンが回る
const gridClass = cva('grid', {
  variants: {
    backed: {
      true: 'grid-cols-[minmax(min-content,1fr)_auto]',
      false: 'grid-cols-[minmax(min-content,1fr)]',
    },
  },
});

const markedName = cva('col-start-1 flex min-w-0 flex-col', { variants: { marked: MARKED } });

const keySize = cva('text-muted-foreground text-right tabular-nums', {
  variants: { marked: MARKED },
});

/** 選んだ種類の 1 件ずつの props */
export interface ItemListProps {
  readonly entry: Entry;
  readonly connected: boolean;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
  readonly onTake: (key: string) => void;
  readonly onOpenFile: (file: File) => void;
  readonly onCloseFile: () => void;
}

/**
 * 選んだ種類の 1 件ずつ。localStorage・sessionStorage はファイルを開いていなければ IndexedDB の合計と
 * 同じ形の表にする。ほかは、左にブラウザの欄を置き、バックアップの列（控えを書く種類・ファイルを開いている
 * 種類）があれば右端に欄と境目の線を足す（つないでいないときは欄だけで空）。狭くしても時刻と大きさは隠さない
 */
export function ItemList({
  entry,
  connected,
  marks,
  busy,
  onToggle,
  onTake,
  onOpenFile,
  onCloseFile,
}: ItemListProps): React.ReactElement {
  const { both, backupOnly } = rowsOf(entry);
  const backed = hasReference(entry);
  const takeable = entry.file === null && backupsOf(entry) !== null;
  const backupInfo = backupInfoOf(entry, connected);
  const area = entry.category.area;
  const row = (item: Row): React.ReactElement => (
    <ItemRow
      key={item.key}
      row={item}
      entry={entry}
      marks={marks}
      busy={busy}
      onToggle={onToggle}
      onTake={
        // ブラウザにだけある 1 件は、控えの一覧を読めていればその場で取れる
        takeable && item.browser !== null && item.backup === null
          ? () => onTake(item.key)
          : undefined
      }
    />
  );
  return (
    // どの種類でも同じ形: 情報（件数・大きさ・バックアップ・開くアイコン）→ 列の見出し → 1 件ずつ。
    // 情報・見出し・名前の左端は揃える
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 tabular-nums">
        {/* ユーザーフォルダの物は、読めていなければ件数の代わりにその旨 */}
        <span>{entry.remote === null ? figures(entry.items) : t(REMOTE_TEXT[entry.remote])}</span>
        {backupInfo === null ? null : <span>{backupInfo}</span>}
        <FileOpener entry={entry} onOpen={onOpenFile} />
      </div>
      {(area === 'local' || area === 'session') && entry.file === null ? (
        <KeyTable entry={entry} marks={marks} busy={busy} onToggle={onToggle} />
      ) : (
        <ul aria-label={t('llm.storage.items')} className={`${gridClass({ backed })} divide-y`}>
          <li className={`${ROW_GRID} text-muted-foreground`}>
            <span className="col-start-1 py-1">
              {t(isBrowserEntry(entry) ? 'llm.storage.column.browser' : 'llm.storage.column.comfy')}
            </span>
            {backed ? (
              <span className={`${BACKUP_CELL} min-w-0 py-1`}>
                {/* ファイルを開いている間は、見出しの代わりにファイルの名前と外すアイコン */}
                {entry.file === null ? (
                  <span className="truncate">{t('llm.storage.column.backup')}</span>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate" title={entry.file.name}>
                      {entry.file.name}
                    </span>
                    <button
                      type="button"
                      className={`${DIALOG_ICON_CLASS} shrink-0`}
                      aria-label={t('llm.storage.closeFile')}
                      title={t('llm.storage.closeFile')}
                      onClick={onCloseFile}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </span>
            ) : null}
          </li>
          {both.length === 0 && backupOnly.length === 0 ? (
            <li className="text-muted-foreground col-span-full py-1">{t('llm.storage.empty')}</li>
          ) : null}
          {both.map(row)}
          {backupOnly.length === 0 ? null : (
            <li className="text-muted-foreground col-span-full py-1 text-2xs">
              {entry.file === null ? t('llm.storage.backupOnly') : t('llm.storage.fileOnly')}
            </li>
          )}
          {backupOnly.map(row)}
        </ul>
      )}
    </div>
  );
}

/**
 * 帯の種類ごとの操作。エクスポート（書き出せる種類だけ）と全て削除（消せない種類（sessionStorage）は出さない）
 */
export function EntryHeader({
  entry,
  marks,
  busy,
  onToggleAll,
}: {
  readonly entry: Entry;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggleAll: (targets: readonly Mark[]) => void;
}): React.ReactElement {
  const all: Mark[] = entry.items.map((item) => ({
    entryId: entry.id,
    side: 'browser',
    key: item.key,
  }));
  const allMarked = all.length > 0 && all.every((mark) => marks.has(markKey(mark)));
  const onExportClick = guardPress('storage-export', () => {
    void exportEntry(entry).catch(() => toastError(t('llm.storage.exportFailed')));
  });
  const onClearAllClick = (): void => onToggleAll(all);
  return (
    <>
      {canExport(entry.category) ? (
        <button
          type="button"
          className={BUTTON}
          disabled={entry.items.length === 0}
          onClick={onExportClick}
        >
          {t('llm.storage.export')}
        </button>
      ) : null}
      {isClearable(entry.category) ? (
        <button
          type="button"
          className={BUTTON}
          disabled={busy || all.length === 0}
          aria-pressed={allMarked}
          onClick={onClearAllClick}
        >
          {t('llm.storage.clearAll')}
        </button>
      ) : null}
    </>
  );
}

/**
 * 件数の行の右端の、エクスポートのファイルを開くアイコン（書き出せる種類だけ）。開いたファイルの名前と
 * 外すアイコンは、バックアップの列の見出しの代わりに出す
 */
function FileOpener({
  entry,
  onOpen,
}: {
  readonly entry: Entry;
  readonly onOpen: (file: File) => void;
}): React.ReactElement | null {
  const input = useRef<HTMLInputElement>(null);
  if (!canExport(entry.category)) return null;
  const onOpenClick = (): void => input.current?.click();
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = event.currentTarget.files?.[0];
    // 同じファイルを選び直しても読むよう、選んだ物を空に戻す
    event.currentTarget.value = '';
    if (picked !== undefined) onOpen(picked);
  };
  return (
    <span className="ml-auto flex shrink-0 items-center">
      <button
        type="button"
        className={`${DIALOG_ICON_CLASS} shrink-0`}
        aria-label={t('llm.storage.openFile')}
        title={t('llm.storage.openFileHint')}
        onClick={onOpenClick}
      >
        <FolderOpen className="size-4" aria-hidden />
      </button>
      <input
        ref={input}
        type="file"
        // 書き出しと同じ 1 行 1 件の gzip
        accept=".jsonl.gz,.gz,application/gzip"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />
    </span>
  );
}

/**
 * localStorage・sessionStorage の 1 件ずつの表（IndexedDB の合計の表と同じ形）。
 * 名前（分かる鍵は説明も）・大きさ・生データ・削除（sessionStorage は消さないので空き）
 */
function KeyTable({
  entry,
  marks,
  busy,
  onToggle,
}: {
  readonly entry: Entry;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
}): React.ReactElement {
  return (
    <table aria-label={t('llm.storage.items')} className="w-full border-collapse">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="py-1 pr-2 font-normal">{t('llm.storage.column.browser')}</th>
          <th className="py-1 pr-2 text-right font-normal">{t('llm.storage.column.size')}</th>
          <th className="py-1" />
        </tr>
      </thead>
      <tbody>
        {entry.items.length === 0 ? (
          <tr className="border-t">
            <td colSpan={3} className="text-muted-foreground py-1">
              {t('llm.storage.empty')}
            </td>
          </tr>
        ) : null}
        {entry.items.map((item) => {
          const name = itemName(item);
          const mark: Mark = { entryId: entry.id, side: 'browser', key: item.key };
          const marked = marks.has(markKey(mark));
          const loadRaw = (): Promise<unknown> => readStorageRaw(entry.category, item.key);
          const onDeleteToggle = (): void => onToggle(mark);
          return (
            <tr key={item.key} className="border-t">
              <td className="py-1 pr-2">
                <div className={markedName({ marked })}>
                  <span className="truncate" title={item.key}>
                    {name}
                  </span>
                  {item.known === null ? null : (
                    <span className="text-muted-foreground text-2xs">
                      {t(KEY_TEXT[item.known][1])}
                    </span>
                  )}
                </div>
              </td>
              <td className={`${keySize({ marked })} py-1 pr-2`}>{formatBytes(item.bytes)}</td>
              <td className="py-1">
                <span className="flex justify-end gap-0.5">
                  <RawButton label={t('llm.storage.raw', { name })} load={loadRaw} />
                  {isClearable(entry.category) ? (
                    <DeleteToggle
                      marked={marked}
                      busy={busy}
                      name={name}
                      onToggle={onDeleteToggle}
                    />
                  ) : (
                    <span className={ICON_SPACER} />
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
