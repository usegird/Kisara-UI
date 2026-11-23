import { describe, expect, it, vi } from 'vitest';

import { parseStyleTable, type SavedStyle } from '@/graph/styles';
import { createStylesStore, type StylesDeps } from '@/store/use-styles-store';

const base = 'http://127.0.0.1:8188';
const style = (name: string, prompt = 'p') => ({ name, prompt, negative: '', other: {} });

function setup(saved: SavedStyle[] = []) {
  const deps = {
    fetchTable: vi.fn<StylesDeps['fetchTable']>(() =>
      Promise.resolve(parseStyleTable('name,prompt\r\na,csv\r\nb,csv\r\n')),
    ),
    fetchSaved: vi.fn<StylesDeps['fetchSaved']>(() => Promise.resolve(saved)),
    saveStyle: vi.fn<StylesDeps['saveStyle']>(() => Promise.resolve()),
  };
  return { deps, store: createStylesStore(deps) };
}

const names = (entries: readonly SavedStyle[]): string[] =>
  entries.map((entry) => (entry.deleted ? `-${entry.name}` : entry.style.name));

describe('読み込み', () => {
  it('styles.csv と kisara/ を合わせて持ち、読んだ接続先を覚える', async () => {
    const { store } = setup([{ deleted: false, style: style('A', 'kisara') }]);

    await store.getState().load(base);

    expect(store.getState().table.styles.map((entry) => entry.prompt)).toEqual(['kisara', 'csv']);
    expect(store.getState().loadedFrom).toBe(base);
  });

  it('読めなければ一覧を空にし、書けない状態にする', async () => {
    const { deps, store } = setup();
    deps.fetchSaved.mockRejectedValueOnce(new Error('HTTP 500'));

    await store.getState().load(base);

    expect(store.getState().table.styles).toEqual([]);
    await expect(store.getState().save(base, null, style('c'))).resolves.toBe('not-loaded');
    expect(deps.saveStyle).not.toHaveBeenCalled();
  });

  it('接続し直したら一覧を捨て、読みかけの結果も入れない', async () => {
    const { store } = setup();
    const loading = store.getState().load(base);

    store.getState().invalidate();
    await loading;

    expect(store.getState().table.styles).toEqual([]);
    expect(store.getState().loadedFrom).toBeNull();
  });
});

describe('書き込み', () => {
  it('読み終えていない接続先には書かない', async () => {
    const { deps, store } = setup();
    await store.getState().load(base);

    await expect(store.getState().save('http://other', null, style('c'))).resolves.toBe(
      'not-loaded',
    );
    await store.getState().remove('http://other', 'a');
    expect(deps.saveStyle).not.toHaveBeenCalled();
  });

  it('保存はその 1 件だけを書く', async () => {
    const { deps, store } = setup();
    await store.getState().load(base);

    await store.getState().save(base, 'a', style('a', 'new'));

    expect(names(deps.saveStyle.mock.calls.map(([, entry]) => entry))).toEqual(['a']);
  });

  it('名前を変えたら新しい名前を書いてから古い名前に消した印を書く', async () => {
    const { deps, store } = setup();
    await store.getState().load(base);

    await store.getState().save(base, 'a', style('c'));

    expect(names(deps.saveStyle.mock.calls.map(([, entry]) => entry))).toEqual(['c', '-a']);
    expect(store.getState().table.styles.map((entry) => entry.name)).toEqual(['c', 'b']);
  });

  it('大文字小文字だけの変更は同じファイルなので、消した印を書かない', async () => {
    const { deps, store } = setup();
    await store.getState().load(base);

    await store.getState().save(base, 'a', style('A'));

    expect(names(deps.saveStyle.mock.calls.map(([, entry]) => entry))).toEqual(['A']);
  });

  it('削除は消した印を書いて一覧から外す', async () => {
    const { deps, store } = setup();
    await store.getState().load(base);

    await store.getState().remove(base, 'b');

    expect(names(deps.saveStyle.mock.calls.map(([, entry]) => entry))).toEqual(['-b']);
    expect(store.getState().table.styles.map((entry) => entry.name)).toEqual(['a']);
  });
});
