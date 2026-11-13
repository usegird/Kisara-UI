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

// ─────────────────────────────
// 古いバックアップの知らせ。ブラウザに元の無い控えのうち 30 日より前の物が
// あれば、つないだときに 1 回だけ知らせる
// ─────────────────────────────

const NOW = 100 * STALE_BACKUP_MS;

let port: ReturnType<typeof comfyPort>;
let lists = 0;

/** システムテンプレートの控えを 1 件置く（最後に変えた時刻を渡す） */
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

/** 確かめの約束（動的な import と控えの一覧）が片付くまで待つ */
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
  useStorageDialogStore.setState({ staleNotice: false, used: false });
});

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

describe('つないだときの知らせ', () => {
  it('古い控えがあれば知らせ、同じ接続先へのつなぎ直しでは確かめ直さない', async () => {
    backupTemplate(1);
    const stop = startBackupCleanupCheck();
    connectComfy();
    await settle();
    expect(useStorageDialogStore.getState().staleNotice).toBe(true);
    const read = lists;
    useConnectionStore.setState({ status: 'disconnected' });
    connectComfy();
    await settle();
    expect(lists).toBe(read);
    stop();
  });

  it('新しい控えだけなら知らせない', async () => {
    backupTemplate(Date.now());
    const stop = startBackupCleanupCheck();
    connectComfy();
    await settle();
    expect(useStorageDialogStore.getState().staleNotice).toBe(false);
    stop();
  });
});
