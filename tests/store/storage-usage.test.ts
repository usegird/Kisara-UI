// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chatMeta } from '@/chat/meta';
import { freshChat } from '@/store/persist/chat-restore';
import { deleteBackup, listBackups } from '@/store/persist/storage-backups';
import {
  buildStorageExport,
  canExport,
  describeRaw,
  readStorageExport,
  restoreStorageRaw,
  scanStorageExport,
} from '@/store/persist/storage-export';
import { deleteStorageItem, readStorageUsage, totalOf } from '@/store/persist/storage-usage';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { useConnectionStore } from '@/store/use-connection-store';
import { SETTINGS_KEY, useSettingsStore } from '@/store/use-settings-store';

import { connectComfy } from '../helpers/connection';
import { fakeEmbeddingPort, type FakeEmbeddingPort } from '../helpers/embedding';

// ─────────────────────────────
// ストレージの管理。保存領域を種類ごと・1 件ずつ数え、消し、控えの一覧を読む。
// 大きい保存領域はテストの環境に無いので、種類が空で出ることだけを見る
// ─────────────────────────────

let embedding: FakeEmbeddingPort;
let port: ReturnType<typeof comfyPort>;

beforeEach(() => {
  port = comfyPort();
  localStorage.clear();
  sessionStorage.clear();
  embedding = fakeEmbeddingPort(null, [
    { id: 'org/a', bytes: 1000 },
    { id: 'org/b', bytes: 500 },
  ]);
  installEmbeddingPort(embedding);
});

afterEach(() => {
  installComfyPort(port);
  useConnectionStore.setState({ status: 'disconnected' });
  useSettingsStore.setState({ baseUrl: '' });
  localStorage.clear();
  sessionStorage.clear();
});

describe('readStorageUsage', () => {
  it('このアプリの鍵だけを 1 件ずつ数え、名前の分かる鍵に印を付ける', async () => {
    localStorage.setItem(SETTINGS_KEY, '{}');
    localStorage.setItem('kisaraui.other', 'x');
    localStorage.setItem('someone-else', 'y');
    const { categories } = await readStorageUsage();
    const local = categories.find((entry) => entry.category.area === 'local')?.items ?? [];
    expect(local.map((item) => item.key)).toEqual(['kisaraui.other', SETTINGS_KEY]);
    expect(local.find((item) => item.key === SETTINGS_KEY)?.known).toBe('settings');
    expect(local.find((item) => item.key === SETTINGS_KEY)?.bytes).toBe(
      (SETTINGS_KEY.length + 2) * 2,
    );
  });

  it('前の版が残した実行の記録の鍵にも名前を付ける', async () => {
    localStorage.setItem('kisaraui.tasks', '{}');
    const { categories } = await readStorageUsage();
    const local = categories.find((entry) => entry.category.area === 'local')?.items ?? [];
    expect(local.find((item) => item.key === 'kisaraui.tasks')?.known).toBe('tasks');
  });

  it('大きい保存領域の 8 つの種類と、置いたモデルを 1 件ずつ出す', async () => {
    const { categories } = await readStorageUsage();
    expect(categories.filter((entry) => entry.category.area === 'indexedDb')).toHaveLength(8);
    const models = categories.find((entry) => entry.category.area === 'cache')?.items ?? [];
    expect(models.map((item) => item.key)).toEqual(['org/a', 'org/b']);
    expect(totalOf(models)).toBe(1500);
  });
});

describe('消す', () => {
  it('小さい保存領域の 1 件はその鍵だけを消す', async () => {
    localStorage.setItem('kisaraui.a', '1');
    localStorage.setItem('kisaraui.b', '2');
    await deleteStorageItem({ area: 'local' }, 'kisaraui.a');
    expect(localStorage.getItem('kisaraui.a')).toBeNull();
    expect(localStorage.getItem('kisaraui.b')).toBe('2');
  });

  it('タブごとの保存領域は消さない', async () => {
    sessionStorage.setItem('kisaraui.c', '3');
    await deleteStorageItem({ area: 'session' }, 'kisaraui.c');
    expect(sessionStorage.getItem('kisaraui.c')).toBe('3');
  });

  it('モデルはその 1 つだけを消す', async () => {
    await deleteStorageItem({ area: 'cache' }, 'org/b');
    expect(embedding.removed).toEqual(['org/b']);
  });
});

describe('deleteBackup', () => {
  it('つないでいなければ投げ、つないでいれば控えの 1 件を消す（会話は会話の置き場から）', async () => {
    const removed: string[] = [];
    installComfyPort({
      ...port,
      library: {
        ...port.library,
        remove: (_baseUrl, kind, id) => {
          removed.push(`${kind}/${id}`);
          return Promise.resolve();
        },
      },
      chats: {
        ...port.chats,
        removeChat: (_baseUrl, id) => {
          removed.push(`chats/${id}`);
          return Promise.resolve();
        },
      },
    });
    await expect(deleteBackup('presets', 'p1')).rejects.toThrow();
    connectComfy();
    await deleteBackup('presets', 'p1');
    await deleteBackup('chats', 'c1');
    expect(removed).toEqual(['presets/p1', 'chats/c1']);
  });
});

describe('listBackups', () => {
  it('つないでいなければ null', async () => {
    expect(await listBackups('presets')).toBeNull();
  });

  it('控えを名前と時刻にして新しい順に並べ、形の違うものは落とす', async () => {
    installComfyPort({
      ...port,
      library: {
        ...port.library,
        list: () =>
          Promise.resolve([
            { id: 't1', name: 'Old', updatedAt: 1 },
            { id: 't2', name: 'New', updatedAt: 2 },
            { broken: true },
          ]),
      },
    });
    connectComfy();
    const items = await listBackups('system-prompts');
    expect(items?.map((item) => item.name)).toEqual(['New', 'Old']);
    expect(items?.[0]?.bytes).toBeGreaterThan(0);
  });

  it('会話は一覧の項目の大きさを使う', async () => {
    installComfyPort({
      ...port,
      chats: {
        ...port.chats,
        listMetas: () => Promise.resolve([{ id: 'c1', name: 'Chat', size: 42, updatedAt: 5 }]),
      },
    });
    connectComfy();
    const items = await listBackups('chats');
    expect(items?.[0]).toMatchObject({ key: 'c1', name: 'Chat', bytes: 42 });
  });
});

describe('エクスポートとファイルを開く', () => {
  it('1 行 1 件の gzip で書き出し、同じ種類でだけ一覧と中身を読み戻せる', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"a":1}');
    const file = await buildStorageExport({ area: 'local' }, [SETTINGS_KEY]);
    expect([...new Uint8Array(await file.slice(0, 2).arrayBuffer())]).toEqual([0x1f, 0x8b]);
    const items = await scanStorageExport(file, { area: 'local' });
    expect(items?.map((item) => item.key)).toEqual([SETTINGS_KEY]);
    const values = await readStorageExport(file, { area: 'local' }, new Set([SETTINGS_KEY]));
    expect(values.get(SETTINGS_KEY)).toEqual({ a: 1 });
    expect(await scanStorageExport(file, { area: 'session' })).toBeNull();
    expect(await scanStorageExport(new Blob(['not json']), { area: 'local' })).toBeNull();
  });

  it('1 つの JSON に全件を入れた前の形のファイル（字下げ付き）は読めないとする', async () => {
    const old = { format: 'kisaraui-storage-export', version: 1, category: 'local', items: {} };
    const pretty = new Blob([JSON.stringify(old, null, 2)]);
    expect(await scanStorageExport(pretty, { area: 'local' })).toBeNull();
  });

  it('アバターと埋め込みモデルは書き出さない', () => {
    expect(canExport({ area: 'indexedDb', table: 'avatar' })).toBe(false);
    expect(canExport({ area: 'cache' })).toBe(false);
    expect(canExport({ area: 'indexedDb', table: 'object-info' })).toBe(false);
    expect(canExport({ area: 'indexedDb', table: 'session' })).toBe(false);
    expect(canExport({ area: 'indexedDb', table: 'chat' })).toBe(true);
    expect(canExport({ area: 'session' })).toBe(true);
  });

  it('ファイルの 1 件は、分かる鍵なら名前を付けて一覧の 1 件にする', () => {
    expect(describeRaw({ area: 'local' }, SETTINGS_KEY, { a: 1 }).known).toBe('settings');
  });

  it('ファイルの 1 件で localStorage を書き換え、読めない形の表の 1 件は戻さない', async () => {
    expect(await restoreStorageRaw({ area: 'local' }, SETTINGS_KEY, { a: 2 })).toBe(true);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe('{"a":2}');
    const preset = { area: 'indexedDb', table: 'preset' } as const;
    expect(await restoreStorageRaw(preset, 'p1', { broken: true })).toBe(false);
  });

  it('上限を超える 1 件は戻さない（会話は設定の会話の上限、ほかは 32 MB）', async () => {
    const preset = { area: 'indexedDb', table: 'preset' } as const;
    const big = { id: 'p1', note: 'x'.repeat(33 * 1024 * 1024) };
    expect(await restoreStorageRaw(preset, 'p1', big)).toBe('too-large');
    useSettingsStore.setState({ chatMaxMegabytes: 1 });
    const chat = { area: 'indexedDb', table: 'chat' } as const;
    const meta = chatMeta('c1', freshChat(), 10);
    const huge = { meta, chat: { chat: freshChat(), pad: 'x'.repeat(2 * 1024 * 1024) } };
    expect(await restoreStorageRaw(chat, 'c1', huge)).toBe('too-large');
  });
  it('会話は、一覧の項目が読めても本文が開くときの確かめを通らなければ戻さない', async () => {
    const table = { area: 'indexedDb', table: 'chat' } as const;
    const meta = chatMeta('c1', freshChat(), 10);
    expect(await restoreStorageRaw(table, 'c1', { meta, chat: { chat: 'broken' } })).toBe(false);
    const messages = [{ id: 'm1', role: 'nobody', content: 'x' }];
    const body = { chat: { ...freshChat(), messages }, savedAt: 1 };
    expect(await restoreStorageRaw(table, 'c1', { meta, chat: body })).toBe(false);
  });

  it('localStorage・sessionStorage はこのアプリの鍵だけを開き、ほかの鍵は戻さない', async () => {
    const header = { format: 'kisaraui-storage-export', version: 1, category: 'local' };
    const lines = [
      header,
      { key: SETTINGS_KEY, value: { a: 1 } },
      { key: 'other', value: 'x' },
      { key: '__proto__', value: 'y' },
    ];
    const file = new Blob([lines.map((line) => JSON.stringify(line)).join('\n')]);
    const items = await scanStorageExport(file, { area: 'local' });
    expect(items?.map((item) => item.key)).toEqual([SETTINGS_KEY]);
    expect(await restoreStorageRaw({ area: 'session' }, 'other', 'x')).toBe(false);
    expect(sessionStorage.getItem('other')).toBeNull();
  });

  it('表の鍵と中の id が違う 1 件は戻さない（会話は一覧の項目の id）', async () => {
    const template = { v: 1, id: 't2', name: 'T', content: 'a', createdAt: 1, updatedAt: 1 };
    const table = { area: 'indexedDb', table: 'system-prompt' } as const;
    expect(await restoreStorageRaw(table, 't1', template)).toBe(false);
    const body = { chat: freshChat(), savedAt: 1 };
    const chat = { area: 'indexedDb', table: 'chat' } as const;
    const meta = chatMeta('c2', freshChat(), 10);
    expect(await restoreStorageRaw(chat, 'c1', { meta, chat: body })).toBe(false);
  });
});
