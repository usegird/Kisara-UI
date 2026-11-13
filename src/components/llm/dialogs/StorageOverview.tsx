import { cva } from 'class-variance-authority';

import {
  allBackupsOf,
  backupsOf,
  COMFY_BACKUP,
  figures,
  formatBackupFigures,
  GROUPS,
  INDEXED_DB,
  INDEXED_DB_IDS,
  isBrowserEntry,
  membersOf,
  OVERVIEW,
  shownEntriesOf,
  TOP_IDS,
  type Entry,
} from '@/components/llm/dialogs/storage-entries';
import { t } from '@/i18n';
import { formatBytes } from '@/lib/text';
import { totalOf, type StorageItem, type StorageUsage } from '@/store/persist/storage-usage';

// ─────────────────────────────
// ストレージの管理の合計の表。全体・IndexedDB・見出しの合計と、Comfy バックアップの合計とクリーンアップ。
// 名前を押すとその場所へ移る（場所と印はダイアログが持つ）。
// ─────────────────────────────

const overviewName = cva('py-1 pr-2', { variants: { indent: { true: 'pl-2', false: '' } } });

/** 合計の表の props */
export interface OverviewProps {
  readonly usage: StorageUsage;
  readonly entries: readonly Entry[];
  /** 選んでいる場所 */
  readonly scope: string;
  readonly connected: boolean;
  readonly onSelect: (id: string) => void;
}

/**
 * 全体・IndexedDB・見出しの合計の表（`scope` は選んでいる場所）。全体は使用量と、全体の下の物と
 * すべての見出しを、IndexedDB は大きい保存領域の表を、見出しはその種類だけを出す
 */
export function Overview({
  usage: siteUsage,
  entries,
  scope,
  connected,
  onSelect,
}: OverviewProps): React.ReactElement {
  const all = scope === OVERVIEW;
  const tables = membersOf(INDEXED_DB_IDS, entries);
  const groups = scope === INDEXED_DB ? [] : GROUPS.filter((group) => all || group.id === scope);
  const shown = shownEntriesOf(scope, entries, tables, groups);
  const backed = shown.filter((entry) => entry.backup !== null);
  // 読めなかった種類は合計に入れない（その行は —）
  const loaded = backed.every((entry) => entry.backups !== null);
  // 使用量はサイト全体の値なので、全体でだけ出す
  const usage = all ? siteUsage : null;
  const onIndexedDbClick = (): void => onSelect(INDEXED_DB);
  const onComfyBackupClick = (): void => onSelect(COMFY_BACKUP);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {usage === null || usage.usage === null || usage.quota === null ? null : (
          <p>
            {t('llm.storage.usage', {
              usage: formatBytes(usage.usage),
              quota: formatBytes(usage.quota),
            })}
          </p>
        )}
        {usage === null || usage.persisted === null ? null : (
          // 使用量の補足なので 1 段字下げする
          <p className="text-muted-foreground pl-4">
            {usage.persisted ? t('llm.storage.persisted') : t('llm.storage.notPersisted')}
          </p>
        )}
        <p>
          {t('llm.storage.browserTotal')}:{' '}
          {figures(shown.filter(isBrowserEntry).flatMap((entry) => entry.items))}
        </p>
        {backed.length === 0 ? null : (
          <p>
            {t('llm.storage.backupTotal')}:{' '}
            {connected && loaded
              ? figures(backed.flatMap((entry) => backupsOf(entry) ?? []))
              : t('llm.storage.notConnected')}
          </p>
        )}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-muted-foreground text-left">
            <th className="py-1 pr-2 font-normal">{t('llm.storage.column.category')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('llm.storage.column.count')}</th>
            <th className="py-1 pr-2 text-right font-normal">{t('llm.storage.column.size')}</th>
            <th className="py-1 text-right font-normal">{t('llm.storage.column.backup')}</th>
          </tr>
        </thead>
        {all ? (
          <tbody>
            <SumRow
              label={t('llm.storage.indexedDb')}
              items={tables.flatMap((entry) => entry.items)}
              onSelect={onIndexedDbClick}
            />
            {membersOf(TOP_IDS, entries).map((entry) => (
              <OverviewRow key={entry.id} entry={entry} indent={false} onSelect={onSelect} />
            ))}
            {/* Comfy バックアップはブラウザの物ではないので、件数と大きさはバックアップの列にだけ出す */}
            <tr className="border-t">
              <td className="py-1 pr-2">
                <button type="button" className="hover:underline" onClick={onComfyBackupClick}>
                  {t('llm.storage.comfyBackup')}
                </button>
              </td>
              <td />
              <td />
              <td className="text-muted-foreground py-1 text-right tabular-nums">
                {formatBackupFigures(allBackupsOf(entries))}
              </td>
            </tr>
          </tbody>
        ) : null}
        {scope === INDEXED_DB ? (
          <tbody>
            {tables.map((entry) => (
              <OverviewRow key={entry.id} entry={entry} indent={false} onSelect={onSelect} />
            ))}
          </tbody>
        ) : null}
        {groups.map((group) => {
          const members = membersOf(group.ids, entries);
          const onGroupClick = (): void => onSelect(group.id);
          return (
            <tbody key={group.id}>
              <SumRow
                label={t(group.label)}
                items={members.filter(isBrowserEntry).flatMap((entry) => entry.items)}
                onSelect={onGroupClick}
              />
              {members.map((entry) => (
                <OverviewRow key={entry.id} entry={entry} indent onSelect={onSelect} />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/** 見出し・IndexedDB の合計の行。名前を押すとそこへ移る */
function SumRow({
  label,
  items,
  onSelect,
}: {
  readonly label: string;
  readonly items: readonly StorageItem[];
  readonly onSelect: () => void;
}): React.ReactElement {
  return (
    <tr className="border-t font-medium">
      <td className="py-1 pr-2">
        <button type="button" className="hover:underline" onClick={onSelect}>
          {label}
        </button>
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">{items.length}</td>
      <td className="py-1 pr-2 text-right tabular-nums">{formatBytes(totalOf(items))}</td>
      <td />
    </tr>
  );
}

function OverviewRow({
  entry,
  indent,
  onSelect,
}: {
  readonly entry: Entry;
  readonly indent: boolean;
  readonly onSelect: (id: string) => void;
}): React.ReactElement {
  const backups = backupsOf(entry);
  const onNameClick = (): void => onSelect(entry.id);
  const name = (
    <td className={overviewName({ indent })}>
      <button type="button" className="hover:underline" onClick={onNameClick}>
        {entry.label}
      </button>
    </td>
  );
  // ユーザーフォルダの物はブラウザの物ではないので、Comfy バックアップと同じく右端の列にだけ出す
  if (!isBrowserEntry(entry)) {
    return (
      <tr className="border-t">
        {name}
        <td />
        <td />
        <td className="text-muted-foreground py-1 text-right tabular-nums">
          {formatBackupFigures(entry.remote === null ? entry.items : null)}
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t">
      {name}
      <td className="py-1 pr-2 text-right tabular-nums">{entry.items.length}</td>
      <td className="py-1 pr-2 text-right tabular-nums">{formatBytes(totalOf(entry.items))}</td>
      <td className="text-muted-foreground py-1 text-right tabular-nums">
        {entry.backup === null ? '' : formatBackupFigures(backups)}
      </td>
    </tr>
  );
}
