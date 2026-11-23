import { describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

import { heldLockNames, holdReleasable } from '@/lib/web-locks';
import { createBaseUrlActions, type BaseUrlResource } from '@/store/kit/base-url-resource';
import { createConnectDialogFlags, type ConnectDialogFlags } from '@/store/kit/connect-dialog';
import { createLibraryTable, restoreOutcomeOf } from '@/store/kit/library-table';
import { captureTabScoped, registerTabScopedValue, restoreTabScoped } from '@/store/kit/tab-scoped';
import { memoryTable } from '@/store/persist/chat-repo';

describe('restoreOutcomeOf', () => {
  it('一覧に無ければ足し、控えが新しければ置き換え、一覧が新しいか同じなら残す', () => {
    expect(restoreOutcomeOf(undefined, { updatedAt: 1 })).toBe('added');
    expect(restoreOutcomeOf({ updatedAt: 1 }, { updatedAt: 2 })).toBe('updated');
    expect(restoreOutcomeOf({ updatedAt: 2 }, { updatedAt: 2 })).toBeNull();
  });
});

describe('createLibraryTable', () => {
  it('形の合わない 1 件を飛ばして読み、差し替えたときに知らせる', async () => {
    const onInstall = vi.fn();
    const library = createLibraryTable('preset', onInstall);
    const table = memoryTable();
    library.install(table);
    expect(onInstall).toHaveBeenCalledTimes(1);
    await table.put('a', { id: 'a' });
    await table.put('b', 'broken');
    const parse = (raw: unknown): { id: string } | null =>
      typeof raw === 'object' && raw !== null && 'id' in raw ? { id: String(raw.id) } : null;
    expect(Object.keys(await library.loadAll(parse, (item) => item.id))).toEqual(['a']);
  });
});

interface Resource extends BaseUrlResource {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly value: number;
}

describe('createBaseUrlActions', () => {
  it('取っている間に接続先が替わったら、前の接続先の結果を入れない', async () => {
    let finish: (value: number) => void = () => undefined;
    const store = create<Resource & ReturnType<typeof createBaseUrlActions>>()((set, get) => ({
      status: 'idle',
      baseUrl: '',
      error: null,
      value: 0,
      ...createBaseUrlActions(set, get, async (baseUrl) => {
        const value = await new Promise<number>((resolve) => {
          if (baseUrl === 'a') finish = resolve;
          else resolve(2);
        });
        return { status: 'ready', value };
      }),
    }));
    const first = store.getState().ensure('a');
    await store.getState().ensure('b');
    finish(1);
    await first;
    expect(store.getState()).toMatchObject({ status: 'ready', baseUrl: 'b', value: 2 });
  });

  it('取っている間は未取得に戻さず、取れた後は戻して取り直せる', async () => {
    const fetchFor = vi.fn(() => Promise.resolve({ status: 'ready' as const }));
    const store = create<Resource & ReturnType<typeof createBaseUrlActions>>()((set, get) => ({
      status: 'idle',
      baseUrl: '',
      error: null,
      value: 0,
      ...createBaseUrlActions(set, get, fetchFor),
    }));
    await store.getState().ensure('a');
    await store.getState().ensure('a');
    expect(fetchFor).toHaveBeenCalledTimes(1);
    store.getState().invalidate();
    expect(store.getState().status).toBe('idle');
    await store.getState().ensure('a');
    expect(fetchFor).toHaveBeenCalledTimes(2);
  });
});

describe('createConnectDialogFlags', () => {
  it('頼まれたら出し、閉じたら自動では出さない印を残す', () => {
    const store = create<ConnectDialogFlags>()((set) => createConnectDialogFlags(set));
    store.getState().open();
    expect(store.getState().requested).toBe(true);
    store.getState().close();
    expect(store.getState()).toMatchObject({ requested: false, dismissed: true });
  });
});

describe('registerTabScopedValue', () => {
  it('開いている値を控え、控えが無いタブへ移ったら閉じる', () => {
    let current: string | null = 'x';
    registerTabScopedValue('kit-test', {
      current: () => current,
      isValue: (saved): saved is string => typeof saved === 'string',
      open: (value) => {
        current = value;
      },
      close: () => {
        current = null;
      },
    });
    const saved = captureTabScoped();
    restoreTabScoped(undefined);
    expect(current).toBeNull();
    restoreTabScoped(saved);
    expect(current).toBe('x');
  });
});

describe('holdReleasable / heldLockNames', () => {
  it('放すまで鍵を持ち、ほかからは取れない', async () => {
    const release = await holdReleasable('kit-test-lock');
    expect(release).not.toBeNull();
    expect(await holdReleasable('kit-test-lock')).toBeNull();
    expect((await heldLockNames())?.has('kit-test-lock')).toBe(true);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await holdReleasable('kit-test-lock')).not.toBeNull();
  });
});
