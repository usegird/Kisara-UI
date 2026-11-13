import {
  allBackupsOf,
  backupsOf,
  figures,
  type Entry,
} from '@/components/llm/dialogs/storage-entries';
import { markKey, type Mark, type Marks } from '@/components/llm/dialogs/storage-marks';
import { BUTTON } from '@/components/llm/dialogs/storage-style';
import { t } from '@/i18n';
import { formatBytes } from '@/lib/text';
import { orphanBackups } from '@/store/persist/storage-backups';
import { totalOf, type StorageItem } from '@/store/persist/storage-usage';

// ─────────────────────────────
// ストレージの管理の Comfy バックアップ。接続先のバックアップの合計と種類ごとの表、その下のクリーンアップ。
// 印はダイアログが持ち、ここは描いて押したことを返すだけ。
// ─────────────────────────────

/** Comfy バックアップの props */
export interface BackupOverviewProps {
  readonly entries: readonly Entry[];
  readonly connected: boolean;
  readonly marks: Marks;
  readonly onSelect: (id: string) => void;
  readonly onToggleAll: (targets: readonly Mark[]) => void;
}

/**
 * Comfy バックアップ。接続先のバックアップの合計と、バックアップする種類ごとの件数と大きさ。
 * 名前を押すとその種類へ移る（1 件ずつはそこで戻す・消す）
 */
export function BackupOverview({
  entries,
  connected,
  marks,
  onSelect,
  onToggleAll,
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
      {connected && all !== null ? (
        <Cleanup entries={backed} marks={marks} onToggleAll={onToggleAll} />
      ) : null}
    </div>
  );
}

/**
 * Comfy バックアップの表の下のクリーンアップ。ブラウザに元の無いバックアップの
 * 件数と大きさを出し、すべてに削除の印を付ける（全部に付いていれば外す）。消すのは「適用」
 */
function Cleanup({
  entries,
  marks,
  onToggleAll,
}: {
  readonly entries: readonly Entry[];
  readonly marks: Marks;
  readonly onToggleAll: (targets: readonly Mark[]) => void;
}): React.ReactElement {
  const orphans = entries.flatMap((entry) =>
    orphanBackups(backupsOf(entry) ?? [], entry.items).map((item) => ({ entry, item })),
  );
  const targets: Mark[] = orphans.map(({ entry, item }) => ({
    entryId: entry.id,
    side: 'backup',
    key: item.key,
  }));
  const marked = targets.length > 0 && targets.every((mark) => marks.has(markKey(mark)));
  const onMarkClick = (): void => onToggleAll(targets);
  return (
    <section className="flex flex-col gap-1" aria-labelledby="storage-cleanup-heading">
      <h3 id="storage-cleanup-heading" className="font-medium">
        {t('llm.storage.cleanup.heading')}
      </h3>
      <p>
        {orphans.length === 0
          ? t('llm.storage.cleanup.none')
          : t('llm.storage.cleanup.orphans', {
              figures: figures(orphans.map(({ item }) => item)),
            })}
      </p>
      {orphans.length === 0 ? null : (
        <>
          <p className="text-muted-foreground">{t('llm.storage.cleanup.hint')}</p>
          <div>
            <button type="button" className={BUTTON} onClick={onMarkClick}>
              {marked ? t('llm.storage.cleanup.unmark') : t('llm.storage.cleanup.mark')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Comfy バックアップの合計の文。つないでいない・読んでいるはその旨 */
function formatBackupTotal(connected: boolean, all: readonly StorageItem[] | null): string {
  if (!connected) return t('llm.storage.notConnected');
  return all === null ? t('llm.storage.loading') : figures(all);
}
