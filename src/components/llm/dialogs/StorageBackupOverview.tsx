import { cva } from 'class-variance-authority';
import { Trash2 } from 'lucide-react';

import {
  allBackupsOf,
  backupsOf,
  figures,
  formatSavedTime,
  itemName,
  type Entry,
} from '@/components/llm/dialogs/storage-entries';
import {
  markKey,
  staleMarkOf,
  type Mark,
  type Marks,
  type StaleBackup,
} from '@/components/llm/dialogs/storage-marks';
import { BUTTON, deleteIcon, MARKED } from '@/components/llm/dialogs/storage-style';
import { t } from '@/i18n';
import { formatBytes } from '@/lib/text';
import { totalOf, type StorageItem } from '@/store/persist/storage-usage';

// ─────────────────────────────
// ストレージの管理の Comfy バックアップ。接続先のバックアップの合計と種類ごとの表、その下のクリーンアップ。
// 印はダイアログが持ち、ここは描いて押したことを返すだけ。
// ─────────────────────────────

/** クリーンアップの 1 件の名前。削除の印を付けたら取り消し線 */
const staleName = cva('min-w-0 flex-1 truncate', { variants: { marked: MARKED } });

/** クリーンアップの 1 件の時刻・大きさ。削除の印を付けたら取り消し線 */
const staleFact = cva('text-muted-foreground whitespace-nowrap tabular-nums', {
  variants: { marked: MARKED },
});

/** Comfy バックアップの props */
export interface BackupOverviewProps {
  readonly entries: readonly Entry[];
  readonly connected: boolean;
  /** クリーンアップの対象。読んでいる・つないでいなければ null */
  readonly stale: readonly StaleBackup[] | null;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (mark: Mark) => void;
}

/**
 * Comfy バックアップ。接続先のバックアップの合計と、バックアップする種類ごとの件数と大きさ。
 * 名前を押すとその種類へ移る（1 件ずつはそこで戻す・消す）
 */
export function BackupOverview({
  entries,
  connected,
  stale,
  marks,
  busy,
  onSelect,
  onToggle,
}: BackupOverviewProps): React.ReactElement {
  const backed = entries.filter((entry) => entry.backup !== null);
  const all = allBackupsOf(entries);
  return (
    <div className="flex flex-col gap-3">
      <p>
        {t('llm.storage.backupTotal')}: {formatBackupTotal(connected, all)}
      </p>
      {connected ? null : (
        <p className="text-muted-foreground">{t('llm.storage.backup.notConnected')}</p>
      )}
      {/* 読めなかった種類は合計に入れず、その行を — にする */}
      {backed.some((entry) => entry.backups === 'failed') ? (
        <p className="text-muted-foreground">{t('llm.storage.backup.failed')}</p>
      ) : null}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1 pr-2 font-normal">{t('llm.storage.column.category')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('llm.storage.column.count')}</th>
            <th className="py-1 text-right font-normal">{t('llm.storage.column.size')}</th>
          </tr>
        </thead>
        <tbody>
          {backed.map((entry) => {
            const backups = backupsOf(entry);
            const onNameClick = (): void => onSelect(entry.id);
            return (
              <tr key={entry.id} className="border-t">
                <td className="py-1 pr-2">
                  <button type="button" className="hover:underline" onClick={onNameClick}>
                    {entry.label}
                  </button>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">
                  {backups === null ? '—' : backups.length}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {backups === null ? '—' : formatBytes(totalOf(backups))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {connected && stale !== null ? (
        <Cleanup stale={stale} marks={marks} busy={busy} onToggle={onToggle} />
      ) : null}
    </div>
  );
}

/**
 * Comfy バックアップを選んでいるときの帯の「全て削除」。クリーンアップの対象すべてに削除の印を付ける
 * （全部に付いていれば外す）。消すのは「適用」
 */
export function CleanupHeader({
  stale,
  marks,
  busy,
  onToggleAll,
}: {
  readonly stale: readonly StaleBackup[];
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggleAll: (targets: readonly Mark[]) => void;
}): React.ReactElement {
  const targets = stale.map(staleMarkOf);
  const allMarked = targets.length > 0 && targets.every((mark) => marks.has(markKey(mark)));
  const onClearAllClick = (): void => onToggleAll(targets);
  return (
    <button
      type="button"
      className={BUTTON}
      disabled={busy || targets.length === 0}
      aria-pressed={allMarked}
      onClick={onClearAllClick}
    >
      {t('llm.storage.clearAll')}
    </button>
  );
}

/** Comfy バックアップの表の下のクリーンアップ。説明と、対象の 1 件ずつ */
function Cleanup({
  stale,
  marks,
  busy,
  onToggle,
}: {
  readonly stale: readonly StaleBackup[];
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-1" aria-labelledby="storage-cleanup-heading">
      <h3 id="storage-cleanup-heading" className="font-medium">
        {t('llm.storage.cleanup.heading')}
      </h3>
      <p className="text-muted-foreground">{t('llm.storage.cleanup.description')}</p>
      {stale.length === 0 ? (
        <p>{t('llm.storage.cleanup.none')}</p>
      ) : (
        <ul>
          {stale.map((target) => (
            <StaleRow
              key={markKey(staleMarkOf(target))}
              target={target}
              marks={marks}
              busy={busy}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** クリーンアップの 1 件。種類・名前・時刻・大きさと削除アイコン */
function StaleRow({
  target,
  marks,
  busy,
  onToggle,
}: {
  readonly target: StaleBackup;
  readonly marks: Marks;
  readonly busy: boolean;
  readonly onToggle: (mark: Mark) => void;
}): React.ReactElement {
  const { entry, item } = target;
  const mark = staleMarkOf(target);
  const marked = marks.has(markKey(mark));
  const name = itemName(item);
  const label = t(marked ? 'llm.storage.unmarkBackup' : 'llm.storage.deleteBackup', { name });
  const onDeleteClick = (): void => onToggle(mark);
  return (
    <li className="flex items-center gap-2 border-t py-1 leading-[22px]">
      <span className="text-muted-foreground shrink-0">{entry.label}</span>
      <span className={staleName({ marked })} title={item.key}>
        {name}
      </span>
      <span className={staleFact({ marked })}>{formatSavedTime(item.updatedAt)}</span>
      <span className={staleFact({ marked })}>{formatBytes(item.bytes)}</span>
      <button
        type="button"
        className={deleteIcon({ marked })}
        disabled={busy}
        aria-pressed={marked}
        aria-label={label}
        title={label}
        onClick={onDeleteClick}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** Comfy バックアップの合計の文。つないでいない・読んでいるはその旨 */
function formatBackupTotal(connected: boolean, all: readonly StorageItem[] | null): string {
  if (!connected) return t('llm.storage.notConnected');
  return all === null ? t('llm.storage.loading') : figures(all);
}
