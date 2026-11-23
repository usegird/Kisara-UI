import { describe, expect, it, vi } from 'vitest';

import { DELETED_KIND, type TagDictionary } from '@/graph/tag-dictionary';
import type { TagsPort } from '@/port/tags';
import { createTagsStore, type TagChanges } from '@/store/use-tags-store';

import { tagEntry } from '../helpers/tags';

const base = 'http://127.0.0.1:8188';

function setup(dictionaries: TagDictionary[] = [], deleted: string[] = []) {
  const overrides = deleted.map((tag) => ({ ...tagEntry(tag), kind: DELETED_KIND }));
  const deps = {
    fetchPysssss: vi.fn<TagsPort['fetchPysssss']>(() =>
      Promise.resolve([tagEntry('smile', 5), tagEntry('cat', 1)]),
    ),
    fetchDictionaries: vi.fn<TagsPort['fetchDictionaries']>(() => Promise.resolve(dictionaries)),
    fetchOverrides: vi.fn<TagsPort['fetchOverrides']>(() => Promise.resolve(overrides)),
    saveDictionary: vi.fn<TagsPort['saveDictionary']>(() => Promise.resolve()),
    saveOverrides: vi.fn<TagsPort['saveOverrides']>(() => Promise.resolve()),
    removeDictionary: vi.fn<TagsPort['removeDictionary']>(() => Promise.resolve()),
  };
  return { deps, store: createTagsStore(deps) };
}

function keys(store: ReturnType<typeof setup>['store']): string[] {
  return store
    .getState()
    .merged.map((tag) => tag.key)
    .sort();
}

function names(store: ReturnType<typeof setup>['store']): string[] {
  return store.getState().dictionaries.map((dictionary) => dictionary.name);
}

describe('useTagsStore', () => {
  it('読むと既定の辞書を先に、ほかを名前の順に並べ、消したタグを除いて合わせる', async () => {
    const { store } = setup(
      [
        { name: 'b', entries: [] },
        { name: 'KisaraUI', entries: [tagEntry('dog')] },
      ],
      ['cat'],
    );
    await store.getState().load(base);

    expect(names(store)).toEqual(['KisaraUI', 'b']);
    expect(keys(store)).toEqual(['dog', 'smile']);
  });

  it('pysssss で消したタグは pysssss の行にだけ効き、辞書の同じタグは残す', async () => {
    const { store } = setup([{ name: 'mine', entries: [tagEntry('smile')] }], ['smile', 'cat']);
    await store.getState().load(base);

    expect(keys(store)).toEqual(['smile']);
    expect(store.getState().merged[0]?.source).toBe('mine');
  });

  it('読み終える前は書かない', async () => {
    const { store, deps } = setup();

    await expect(store.getState().commit(base, changes({}))).resolves.toBe('not-loaded');
    expect(deps.saveOverrides).not.toHaveBeenCalled();
  });

  it('確定で消す・上書き・新しい辞書・pysssss の上書きをまとめて書き、手元にも入れる', async () => {
    const { store, deps } = setup([
      { name: 'old', entries: [] },
      { name: 'kept', entries: [] },
    ]);
    await store.getState().load(base);

    const result = store.getState().commit(
      base,
      changes({
        dictionaries: [
          { name: 'KisaraUI', entries: [tagEntry('Cat', 9)] },
          { name: 'kept', entries: [tagEntry('dog')] },
          { name: 'new', entries: [] },
        ],
        removed: ['old'],
        overrides: [{ ...tagEntry('smile'), kind: DELETED_KIND }],
      }),
    );
    await expect(result).resolves.toBeNull();
    expect(deps.saveOverrides).toHaveBeenCalledTimes(1);

    expect(deps.removeDictionary).toHaveBeenCalledWith(base, 'old', {});
    const overwrite = deps.saveDictionary.mock.calls.map((call) => [call[1].name, call[2]]);
    expect(overwrite).toEqual([
      ['KisaraUI', true],
      ['kept', true],
      ['new', false],
    ]);
    expect(names(store)).toEqual(['KisaraUI', 'kept', 'new']);
    expect(keys(store)).toEqual(['cat', 'dog']);
  });

  it('名前の空の新しい辞書があれば何も書かない', async () => {
    const { store, deps } = setup([{ name: 'a', entries: [] }]);
    await store.getState().load(base);

    const result = store
      .getState()
      .commit(base, changes({ dictionaries: [{ name: ' ', entries: [] }], removed: ['a'] }));
    await expect(result).resolves.toBe('empty-name');
    expect(deps.removeDictionary).not.toHaveBeenCalled();
  });

  it('途中で断られたら、書けた分だけを手元に入れて理由を持つ', async () => {
    const { store, deps } = setup([{ name: 'a', entries: [] }]);
    await store.getState().load(base);
    deps.saveDictionary.mockRejectedValueOnce(new Error('boom'));

    const result = store
      .getState()
      .commit(
        base,
        changes({ dictionaries: [{ name: 'a', entries: [tagEntry('x')] }], removed: ['a'] }),
      );
    await expect(result).resolves.toBe('failed');

    expect(names(store)).toEqual([]);
    expect(store.getState().error).not.toBeNull();
  });
});

function changes(part: Partial<TagChanges>): TagChanges {
  return { dictionaries: [], removed: [], overrides: null, ...part };
}
