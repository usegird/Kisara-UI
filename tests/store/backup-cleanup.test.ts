import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startBackupCleanupCheck } from '@/store/persist/backup-cleanup';
import {
  hasStaleBackups,
  isStaleBackup,
  orphanBackups,
  STALE_BACKUP_MS,
} from '@/store/persist/storage-backups';
import { type StorageItem } from '@/store/persist/storage-usage';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

import { connectComfy } from '../helpers/connection';

const NOW = 100 * STALE_BACKUP_MS;

let port: ReturnType<typeof comfyPort>;
let lists = 0;

function backupTemplate(updatedAt: number): void {
  installComfyPort({
    ...port,
    chats: { ...port.chats, listMetas: () => Promise.resolve([]) },
    library: {
      ...port.library,
      list: (_baseUrl, kind) => {
        lists += 1;
        return Promise.resolve(
          kind === 'system-prompts'
            ? [{ v: 1, id: 't1', name: 'One', content: 'a', createdAt: 1, updatedAt }]
            : [],
        );
      },
    },
  });
}

function item(key: string, updatedAt: number | null): StorageItem {
  return { key, name: '', known: null, updatedAt, bytes: 1 };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  port = comfyPort();
  lists = 0;
});

afterEach(() => {
  installComfyPort(port);
  useConnectionStore.setState({ status: 'disconnected' });
  useStorageDialogStore.setState({ isOpen: false, staleUrl: null, used: false });
});

const staleUrl = () => useStorageDialogStore.getState().staleUrl;

describe('元の無い控えと古さ', () => {
  it('ブラウザに同じ鍵の無い控えだけを拾い、30 日より前（時刻の無い物は除く）を古いとする', () => {
    const orphans = orphanBackups([item('a', 1), item('b', 1)], [item('a', null)]);
    expect(orphans.map((found) => found.key)).toEqual(['b']);
    expect(isStaleBackup(item('b', NOW - STALE_BACKUP_MS), NOW)).toBe(true);
    expect(isStaleBackup(item('b', NOW - STALE_BACKUP_MS + 1), NOW)).toBe(false);
    expect(isStaleBackup(item('b', null), NOW)).toBe(false);
  });

  it('つないでいなければ古い物は無いとし、つないでいれば元の無い古い控えを見つける', async () => {
    backupTemplate(1);
    expect(await hasStaleBackups(NOW)).toBe(false);
    connectComfy();
    expect(await hasStaleBackups(NOW)).toBe(true);
    backupTemplate(NOW - 1);
    expect(await hasStaleBackups(NOW)).toBe(false);
  });
});

describe('つないだときの見張り', () => {
  it('古い控えがあれば行を出し、切ったら下げ、同じ接続先へのつなぎ直しでは確かめ直さない', async () => {
    backupTemplate(1);
    const stop = startBackupCleanupCheck();
    connectComfy();
    await settle();
    expect(staleUrl()).toBe('http://comfy');
    const read = lists;
    useConnectionStore.setState({ status: 'disconnected' });
    expect(staleUrl()).toBeNull();
    connectComfy();
    await settle();
    expect(lists).toBe(read);
    stop();
  });

  it('新しい控えだけなら行を出さない', async () => {
    backupTemplate(Date.now());
    const stop = startBackupCleanupCheck();
    connectComfy();
    await settle();
    expect(staleUrl()).toBeNull();
    stop();
  });

  it('行を出している間にストレージの管理を閉じたら確かめ直し、古い物が無ければ下げる', async () => {
    backupTemplate(1);
    const stop = startBackupCleanupCheck();
    connectComfy();
    await settle();
    useStorageDialogStore.getState().open('comfyBackup');
    const read = lists;
    await settle();
    expect(lists).toBe(read);

    useStorageDialogStore.getState().close();
    await settle();
    expect(lists).toBeGreaterThan(read);
    expect(staleUrl()).toBe('http://comfy');
    backupTemplate(Date.now());
    useStorageDialogStore.getState().open('comfyBackup');
    useStorageDialogStore.getState().close();
    await settle();
    expect(staleUrl()).toBeNull();

    const after = lists;
    useStorageDialogStore.getState().open();
    useStorageDialogStore.getState().close();
    await settle();
    expect(lists).toBe(after);
    stop();
  });
});
