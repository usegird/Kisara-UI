import { toastRestoreResult } from '@/components/llm/dialogs/restore-toast';
import {
  exportFileName,
  itemName,
  type Entry,
  type OpenedFile,
} from '@/components/llm/dialogs/storage-entries';
import type { Mark } from '@/components/llm/dialogs/storage-marks';
import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import {
  deleteBackup,
  readBackupRaw,
  restoreBackup,
  takeBackup,
  type BackupKind,
} from '@/store/persist/storage-backups';
import {
  buildStorageExport,
  canExport,
  readStorageExport,
  restoreStorageRaw,
  scanStorageExport,
} from '@/store/persist/storage-export';
import { deleteStorageItem, type StorageItem } from '@/store/persist/storage-usage';

export interface ApplyOutcome {
  local: boolean;
  indexedDb: boolean;
  failed: boolean;
  readonly restored: { added: number; updated: number; failed: boolean; any: boolean };
  readonly fromFile: { count: number; failed: boolean };
  tooLarge: number;
}

export async function applyMarks(
  all: readonly Mark[],
  byId: ReadonlyMap<string, Entry>,
): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = {
    local: false,
    indexedDb: false,
    failed: false,
    restored: { added: 0, updated: 0, failed: false, any: false },
    fromFile: { count: 0, failed: false },
    tooLarge: 0,
  };
  const fromFiles = await fileValues(all, byId);
  for (const mark of all.filter((item) => item.side === 'restore')) {
    const target = byId.get(mark.entryId);
    if (target === undefined) continue;
    if (target.file !== null) {
      await restoreFromFile(outcome, target, mark, fromFiles.get(target.id));
    } else if (target.backup !== null) {
      await restoreFromBackup(outcome, target.backup, mark.key);
    }
  }
  for (const mark of all.filter((item) => item.side !== 'restore')) {
    const target = byId.get(mark.entryId);
    if (target !== undefined) await deleteMarked(outcome, target, mark);
  }
  return outcome;
}

export function toastApplied({ restored, fromFile, tooLarge, failed }: ApplyOutcome): void {
  if (restored.any) toastRestoreResult(restored);
  if (fromFile.count > 0) toastSuccess(t('llm.storage.fileRestored', { count: fromFile.count }));
  if (fromFile.failed) toastError(t('llm.storage.fileRestoreFailed'));
  if (tooLarge > 0) toastError(t('llm.storage.restoreTooLarge', { count: tooLarge }));
  if (failed) toastError(t('llm.storage.clearFailed'));
}

export async function openStorageFile(target: Entry, picked: File): Promise<OpenedFile | null> {
  if (!canExport(target.category)) return null;
  const items = await scanStorageExport(picked, target.category);
  if (items === null) {
    toastError(t('llm.storage.openFailed'));
    return null;
  }
  return { name: picked.name, blob: picked, items };
}

export async function takeEntryBackup(target: Entry, key: string): Promise<boolean> {
  if (target.backup === null) return false;
  const found = target.items.find((item) => item.key === key);
  const shownName = found === undefined ? key : itemName(found);
  const ok = await takeBackup(target.backup, key);
  if (!ok) {
    toastError(t('llm.storage.backupTakeFailed', { name: shownName }));
    return false;
  }
  toastSuccess(t('llm.storage.backupTaken', { name: shownName }));
  return true;
}

export async function exportEntry(entry: Entry): Promise<void> {
  if (!canExport(entry.category)) return;
  const keys = entry.items.map((item) => item.key);
  downloadBlob(await buildStorageExport(entry.category, keys), exportFileName(entry));
}

export function readReferenceValue(entry: Entry, key: string): Promise<unknown> {
  const { backup: kind, file } = entry;
  if (file !== null && canExport(entry.category)) {
    return readStorageExport(file.blob, entry.category, new Set([key])).then(
      (values) => values.get(key) ?? null,
    );
  }
  return kind === null ? Promise.resolve(null) : readBackupRaw(kind, key);
}

async function restoreFromFile(
  outcome: ApplyOutcome,
  target: Entry,
  mark: Mark,
  values: ReadonlyMap<string, unknown> | undefined,
): Promise<void> {
  const result =
    values !== undefined &&
    canExport(target.category) &&
    (await restoreStorageRaw(target.category, mark.key, values.get(mark.key)).catch(() => false));
  if (result === 'too-large') {
    outcome.tooLarge += 1;
    return;
  }
  if (result) outcome.fromFile.count += 1;
  else outcome.fromFile.failed = true;
  outcome.local ||= result && target.category.area !== 'indexedDb';
  outcome.indexedDb ||= result && target.category.area === 'indexedDb';
}

async function restoreFromBackup(
  outcome: ApplyOutcome,
  backup: BackupKind,
  key: string,
): Promise<void> {
  const result = await restoreBackup(backup, key);
  outcome.restored.any = true;
  outcome.restored.added += result.added;
  outcome.restored.updated += result.updated;
  outcome.restored.failed ||= result.failed;
  outcome.tooLarge += result.tooLarge ?? 0;
}

async function deleteMarked(outcome: ApplyOutcome, target: Entry, mark: Mark): Promise<void> {
  try {
    if (mark.side === 'backup' && target.backup !== null) {
      await deleteBackup(target.backup, mark.key);
      return;
    }
    await deleteStorageItem(target.category, mark.key);
    outcome.local ||= target.category.area === 'local';
    outcome.indexedDb ||=
      target.category.area === 'indexedDb' || target.category.area === 'userFiles';
  } catch {
    outcome.failed = true;
  }
}

async function fileValues(
  marks: readonly Mark[],
  byId: ReadonlyMap<string, Entry>,
): Promise<Map<string, ReadonlyMap<string, unknown>>> {
  const wanted = new Map<string, Set<string>>();
  for (const mark of marks) {
    if (mark.side !== 'restore' || byId.get(mark.entryId)?.file == null) continue;
    const keys = wanted.get(mark.entryId) ?? new Set<string>();
    keys.add(mark.key);
    wanted.set(mark.entryId, keys);
  }
  const found = new Map<string, ReadonlyMap<string, unknown>>();
  for (const [entryId, keys] of wanted) {
    const entry = byId.get(entryId);
    if (entry?.file == null || !canExport(entry.category)) continue;
    const values = await readStorageExport(entry.file.blob, entry.category, keys).catch(() => null);
    if (values !== null) found.set(entryId, values);
  }
  return found;
}

export async function readRemoteLists<K extends string>(
  kinds: readonly K[],
  read: (kind: K) => Promise<StorageItem[] | null>,
): Promise<Partial<Record<K, readonly StorageItem[] | 'failed'>>> {
  const entries = await Promise.all(
    kinds.map(async (kind) => {
      const items = await read(kind).catch(() => 'failed' as const);
      return [kind, items ?? 'failed'] as const;
    }),
  );
  const lists: Partial<Record<K, readonly StorageItem[] | 'failed'>> = {};
  for (const [kind, items] of entries) lists[kind] = items;
  return lists;
}
