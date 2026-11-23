import { afterEach, describe, expect, it } from 'vitest';

import { memoryTable } from '@/store/persist/chat-repo';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import {
  deleteInOrder,
  useWriteConflictsStore,
  writeChecked,
  type CheckedWrite,
} from '@/store/use-write-conflicts-store';

afterEach(() => {
  for (const { key } of useWriteConflictsStore.getState().conflicts) {
    useWriteConflictsStore.getState().close(key);
  }
});

function writer(table: ReturnType<typeof memoryTable>, latest: { current: unknown }) {
  return (
    value: { readonly updatedAt: number; readonly by?: string },
    expected: number | null,
  ): CheckedWrite => ({
    table,
    scope: 'test',
    id: 'a',
    value,
    expected,
    name: 'A',
    latest: () => latest.current,
  });
}

describe('追加辞書の書き込み', () => {
  it('ほかのタブで直した辞書を、古い一覧から直しても上書きしない', async () => {
    const table = memoryTable();
    installDictionaryTable(table);
    const dictionary = useDictionariesStore.getState().add('Lore');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await table.put(dictionary.id, { ...dictionary, name: 'Other tab', updatedAt: 9e12 });

    useDictionariesStore.getState().update(dictionary.id, { name: 'This tab' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await table.get(dictionary.id)).toMatchObject({ name: 'Other tab' });
    expect(useWriteConflictsStore.getState().conflicts[0]).toMatchObject({
      name: 'This tab',
      kind: 'changed',
    });
    installDictionaryTable(null);
  });
});

describe('書く前の照合', () => {
  it('置き場がこのタブの知っている版のままなら書き、続けて直しても食い違わない', async () => {
    const table = memoryTable();
    await table.put('a', { updatedAt: 1 });
    const write = writer(table, { current: undefined });

    void writeChecked(write({ updatedAt: 2 }, 1));
    await writeChecked(write({ updatedAt: 3 }, 2));

    expect(await table.get('a')).toEqual({ updatedAt: 3 });
    expect(useWriteConflictsStore.getState().conflicts).toEqual([]);
  });

  it('ほかのタブで直していたら書かずに知らせ、上書きを押すと今の内容を書く', async () => {
    const table = memoryTable();
    await table.put('a', { updatedAt: 5, by: 'other' });
    const latest: { current: unknown } = { current: { updatedAt: 3, by: 'mine' } };
    const write = writer(table, latest);

    await writeChecked(write({ updatedAt: 2, by: 'mine' }, 1));
    await writeChecked(write({ updatedAt: 3, by: 'mine' }, 2));
    expect(await table.get('a')).toEqual({ updatedAt: 5, by: 'other' });
    expect(useWriteConflictsStore.getState().conflicts).toEqual([
      { key: 'test:a', name: 'A', kind: 'changed' },
    ]);

    await useWriteConflictsStore.getState().overwrite('test:a');
    expect(await table.get('a')).toEqual({ updatedAt: 3, by: 'mine' });
    expect(useWriteConflictsStore.getState().conflicts).toEqual([]);
  });

  it('ほかのタブで消していたら、消えたと知らせて戻さない', async () => {
    const table = memoryTable();
    await writeChecked(writer(table, { current: undefined })({ updatedAt: 2 }, 1));
    expect(await table.get('a')).toBeUndefined();
    expect(useWriteConflictsStore.getState().conflicts[0]?.kind).toBe('removed');
  });

  it('新しく足す 1 件は照合しない。消すのは先の書き込みの後で、知らせも外す', async () => {
    const table = memoryTable();
    void writeChecked(writer(table, { current: undefined })({ updatedAt: 1 }, null));
    await deleteInOrder(table, 'test', 'a');
    expect(await table.get('a')).toBeUndefined();

    await writeChecked(writer(table, { current: undefined })({ updatedAt: 2 }, 1));
    expect(useWriteConflictsStore.getState().conflicts).toHaveLength(1);
    await deleteInOrder(table, 'test', 'a');
    expect(useWriteConflictsStore.getState().conflicts).toEqual([]);
  });
});
