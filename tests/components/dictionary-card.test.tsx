// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryCard } from '@/components/llm/dictionary/DictionaryCard';
import { memoryTable } from '@/store/persist/chat-repo';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { useChatStore } from '@/store/use-chat-store';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { fakeEmbeddingPort } from '../helpers/embedding';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat, loreEntry } from '../helpers/llm';

// ─────────────────────────────
// 拡張のタブの追加辞書のカードと辞書のダイアログ
// ─────────────────────────────

beforeEach(() => {
  // カードの中の近似判定が、置いたモデルの一覧を読む
  installEmbeddingPort(fakeEmbeddingPort());
  installPresetTable(memoryTable());
  installDictionaryTable(memoryTable());
  usePresetsStore.setState({ presets: {}, loaded: true });
  useDictionariesStore.setState({ dictionaries: {}, loaded: true });
  useSettingsStore.setState({ loreDictionaryIds: [], dialogLayouts: {} });
  useChatStore.setState({ chats: { c1: chat() } });
});

afterEach(() => {
  cleanup();
  installPresetTable(null);
  installDictionaryTable(null);
});

function adopt(name: string, contents: readonly string[]) {
  const entries = contents.map((content) => loreEntry({ keys: [content], content }));
  return useDictionariesStore.getState().adopt(name, entries).dictionary;
}

describe('一覧', () => {
  it('新規作成で項目の無い辞書を足して有効にし、そのダイアログを開く。取り込みはボタンで出す', () => {
    render(<DictionaryCard />);
    expect(screen.getByRole('button', { name: 'jsonを開く' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新規作成' }));
    const [created] = Object.values(useDictionariesStore.getState().dictionaries);
    expect(created).toMatchObject({ name: '新しい辞書', entries: [] });
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([created?.id]);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('有効にした辞書を上に並べ、チェックで有効にする', () => {
    const own = adopt('Own', ['a']);
    const global = adopt('Global', ['b']);
    useSettingsStore.setState({ loreDictionaryIds: [global.id] });
    render(<DictionaryCard />);

    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getAllByText(/Own|Global/u)[0]?.textContent)).toEqual([
      'Global',
      'Own',
    ]);

    fireEvent.click(within(rows[1] as HTMLElement).getByRole('checkbox'));
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([global.id, own.id]);
  });

  it('ダイアログの消すアイコンで確認を出し、決めると一覧と有効にした並びから外す', () => {
    const book = adopt('Book', ['a']);
    useSettingsStore.setState({ loreDictionaryIds: [book.id] });
    render(<DictionaryCard />);
    // 一覧の行には消すアイコンを置かない
    expect(screen.queryByRole('button', { name: 'Book を消す' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));
    expect(screen.getByText('辞書を削除しますか？')).toBeTruthy();
    expect(screen.getByText('「Book」を削除します。元に戻せません。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(useDictionariesStore.getState().dictionaries[book.id]).toBeUndefined();
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([]);
  });
});

const TRIGGER = 'トリガーワード';

describe('辞書のダイアログ', () => {
  it('絞り込みで項目を減らす。名前は OK で辞書に書いて閉じ、Escape は打ちかけを戻す', () => {
    const book = adopt('Book', ['apple', 'banana']);
    render(<DictionaryCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'ban' } });
    const triggers = within(dialog).getAllByRole('textbox', { name: TRIGGER });
    expect(triggers.map((input) => (input as HTMLInputElement).value)).toEqual(['banana']);

    const name = within(dialog).getByRole('textbox', { name: '名前' });
    fireEvent.change(name, { target: { value: 'Draft' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect((name as HTMLInputElement).value).toBe('Book');
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Renamed' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(useDictionariesStore.getState().dictionaries[book.id]?.name).toBe('Book');
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(useDictionariesStore.getState().dictionaries[book.id]?.name).toBe('Renamed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('項目を足して直し、追加先を選ぶ。「*」は常に入れる。消すのは確かめない', () => {
    const book = adopt('Book', ['apple']);
    render(<DictionaryCard />);
    const entries = () => useDictionariesStore.getState().dictionaries[book.id]?.entries ?? [];
    const open = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
      return screen.getByRole('dialog');
    };
    // 足した項目は末尾に入る
    const added = (dialog: HTMLElement, role: string, name: string) =>
      within(dialog).getAllByRole(role, { name }).at(-1)!;
    const ok = (dialog: HTMLElement) =>
      fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));

    let dialog = open();
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    // 足した項目は末尾に入り、開いて出す。OK を押すまで辞書は変わらない
    expect(added(dialog, 'button', '追加条件と追加内容').getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(entries()).toHaveLength(1);
    const trigger = added(dialog, 'textbox', TRIGGER);
    fireEvent.change(trigger, { target: { value: '*, pear、 梨 ,' } });
    fireEvent.blur(trigger);
    const condition = within(dialog).getByRole('textbox', { name: '追加条件' });
    fireEvent.change(condition, { target: { value: 'night' } });
    fireEvent.blur(condition);
    fireEvent.change(added(dialog, 'combobox', '追加先'), { target: { value: 'historyEnd' } });
    fireEvent.change(added(dialog, 'combobox', '発言者'), { target: { value: 'user' } });
    fireEvent.change(added(dialog, 'spinbutton', '位置'), { target: { value: '-2' } });
    const probability = added(dialog, 'spinbutton', '発動率');
    expect(probability.getAttribute('step')).toBe('10');
    fireEvent.change(probability, { target: { value: '30' } });
    const logic = within(dialog).getByRole('combobox', { name: '追加条件の論理' });
    fireEvent.change(logic, { target: { value: 'nand' } });
    expect(condition.getAttribute('placeholder')).toBe(
      'カンマ区切り。すべては出ていないときだけ入れる',
    );
    ok(dialog);
    expect(entries()).toHaveLength(2);
    expect(entries()[1]).toMatchObject({
      keys: ['pear', '梨'],
      secondaryKeys: ['night'],
      constant: true,
      historyStart: false,
      depth: { depth: 2, role: 'user' },
      logic: 'nand',
      probability: 30,
    });

    dialog = open();
    fireEvent.change(added(dialog, 'combobox', '追加先'), { target: { value: 'historyStart' } });
    ok(dialog);
    expect(entries()[1]).toMatchObject({ historyStart: true, depth: null });

    dialog = open();
    fireEvent.click(added(dialog, 'button', '項目を消す'));
    ok(dialog);
    expect(entries().map((entry) => entry.content)).toEqual(['apple']);
  });

  it('論理を RAG にしてもトリガーワードはそのまま。追加条件は区切らずに 1 つの文で書く', () => {
    const book = adopt('Book', ['apple']);
    useSettingsStore.setState({ loreSemantic: false });
    render(<DictionaryCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '追加条件と追加内容' }));
    const logic = within(dialog).getByRole('combobox', { name: '追加条件の論理' });
    fireEvent.change(logic, { target: { value: 'rag' } });
    const trigger = within(dialog).getAllByRole('textbox', { name: TRIGGER })[0]!;
    expect((trigger as HTMLInputElement).disabled).toBe(false);
    const condition = within(dialog).getByRole('textbox', { name: '追加条件' });
    expect(condition.getAttribute('placeholder')).toBe(
      '類似度で照合させる自然文を入力。トリガーワードは無視されます',
    );
    fireEvent.change(condition, { target: { value: '果物、特にりんごの話をしているとき' } });
    fireEvent.blur(condition);
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    const entries = useDictionariesStore.getState().dictionaries[book.id]?.entries ?? [];
    expect(entries[0]).toMatchObject({
      logic: 'rag',
      keys: ['apple'],
      secondaryKeys: ['果物、特にりんごの話をしているとき'],
    });
  });

  it('キャンセルは確かめずに直しかけを捨てて閉じ、× か Escape は閉じてよいかを確かめる', () => {
    const book = adopt('Book', ['apple']);
    render(<DictionaryCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByText('編集中の内容')).toBeTruthy();
    expect(screen.getByText('変更は保存されていませんが閉じても良いですか？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useDictionariesStore.getState().dictionaries[book.id]?.entries).toHaveLength(1);
  });

  it('絞り込んでいる間は取っ手を出さない', () => {
    adopt('Book', ['apple', 'banana']);
    render(<DictionaryCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: /を並べ替える$/u })).toHaveLength(2);
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'ban' } });
    expect(within(dialog).queryAllByRole('button', { name: /を並べ替える$/u })).toHaveLength(0);
  });

  it('開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    adopt('Book', ['a']);
    const leak = leakWatch();
    render(<DictionaryCard />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Book を編集' }));
        await Promise.resolve();
      });
      leak.watch(await screen.findByRole('dialog'));
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
