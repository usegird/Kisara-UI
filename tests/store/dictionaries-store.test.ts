import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { memoryTable, type ChatTable } from '@/store/persist/chat-repo';
import { sourcesOf } from '@/store/use-chat-store';
import {
  importDictionaryFile,
  installDictionaryTable,
  useDictionariesStore,
} from '@/store/use-dictionaries-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { chat, chatMessage, loreEntry } from '../helpers/llm';

// ─────────────────────────────
// 追加辞書の一覧と、プリセットのロアブックとの当てる順
// ─────────────────────────────

let presetTable: ChatTable;

beforeEach(() => {
  presetTable = memoryTable();
  installPresetTable(presetTable);
  installDictionaryTable(memoryTable());
  usePresetsStore.setState({ presets: {}, loaded: true });
  useDictionariesStore.setState({ dictionaries: {}, loaded: true });
  useSettingsStore.setState({ loreDictionaryIds: [] });
});

afterEach(() => {
  installPresetTable(null);
  installDictionaryTable(null);
});

const csv = (name: string, body: string) => new File([body], name, { type: 'text/csv' });

describe('取り込み', () => {
  it('取り込むと一覧に足して有効にする。同じ中身は足さずに、それを有効にする', async () => {
    const first = await importDictionaryFile(csv('slang.csv', 'ぴえん,泣きそう'));
    expect(first).toMatchObject({ kind: 'added', name: 'slang', count: 1 });
    const [dictionary] = Object.values(useDictionariesStore.getState().dictionaries);
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([dictionary?.id]);

    useSettingsStore.getState().setLoreDictionaryEnabled(dictionary?.id ?? '', false);
    const again = await importDictionaryFile(csv('copy.csv', 'ぴえん,泣きそう'));
    expect(again).toMatchObject({ kind: 'existing', name: 'slang' });
    expect(Object.keys(useDictionariesStore.getState().dictionaries)).toHaveLength(1);
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([dictionary?.id]);
  });

  it('読めないファイルは足さずに理由を返す', async () => {
    expect(await importDictionaryFile(csv('a.txt', 'x'))).toMatchObject({
      kind: 'error',
      problem: 'format',
    });
    expect(useDictionariesStore.getState().dictionaries).toEqual({});
  });
});

describe('消す', () => {
  it('一覧と有効にした並びから外す', () => {
    const { dictionary } = useDictionariesStore
      .getState()
      .adopt('book', [loreEntry({ content: 'C.' })]);
    useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);

    useDictionariesStore.getState().remove(dictionary.id);
    expect(useDictionariesStore.getState().dictionaries[dictionary.id]).toBeUndefined();
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([]);
  });

  it('新規作成は項目の無い辞書を足し、有効にした並びの最後に加える', () => {
    const first = useDictionariesStore.getState().add('A');
    const second = useDictionariesStore.getState().add('A');
    expect(second.id).not.toBe(first.id);
    expect(second.entries).toEqual([]);
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([first.id, second.id]);
  });

  it('読み込んだとき、有効にした並びの中の一覧に無い id を外す', async () => {
    useDictionariesStore.setState({ loaded: false });
    useSettingsStore.setState({ loreDictionaryIds: ['gone'] });
    await useDictionariesStore.getState().load();
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([]);
  });
});

describe('カードのロアブック', () => {
  const book = { entries: [{ keys: ['castle'], content: 'A castle.' }] };
  it('カードのロアブックはプリセットの中に持ち、追加辞書の表には足さない', async () => {
    const preset = await usePresetsStore
      .getState()
      .addCard({ spec: 'chara_card_v2', data: { name: 'A', character_book: book } }, null);
    expect(preset.lorebooks[0]?.entries.map((entry) => entry.content)).toEqual(['A castle.']);
    expect(useDictionariesStore.getState().dictionaries).toEqual({});
    expect(useSettingsStore.getState().loreDictionaryIds).toEqual([]);
  });
});

describe('会話に当てる出どころ', () => {
  const talk = (patch: Parameters<typeof chat>[1] = {}) =>
    chat([chatMessage('u1', 'user', ['the castle'])], patch);
  const sent = (patch: Parameters<typeof chat>[1] = {}) =>
    sourcesOf(talk(patch)).markerText('additionalInfo');

  it('全体で有効にした辞書は、プリセットの無い会話にも当たる', () => {
    const { dictionary } = useDictionariesStore
      .getState()
      .adopt('g', [loreEntry({ keys: ['castle'], content: 'Global.' })]);
    expect(sent()).toBe('');
    useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, true);
    expect(sent()).toBe('Global.');
  });

  it('全体の辞書が先、会話の個別追加辞書が後（並びの順）。送るときはプリセットを読まない', () => {
    const global = useDictionariesStore
      .getState()
      .adopt('g', [loreEntry({ keys: ['castle'], content: 'Global.' })]).dictionary;
    useSettingsStore.getState().setLoreDictionaryEnabled(global.id, true);
    const own = { id: 'b1', name: '', entries: [loreEntry({ keys: ['castle'], content: 'Own.' })] };
    const lorebooks = [own];
    const preset = usePresetsStore.getState().add('P', EMPTY_CHARACTER, null, lorebooks);
    expect(sent({ preset: { id: preset.id, name: 'P' }, lorebooks })).toBe('Global.\n\nOwn.');
    // 写しを持たない会話は、リンクしたプリセットに辞書があっても当てない
    expect(sent({ preset: { id: preset.id, name: 'P' } })).toBe('Global.');
    // 写した会話は、プリセットが見つからなくても自分の辞書で当てる
    expect(sent({ preset: { id: 'missing', name: 'gone' }, lorebooks })).toBe('Global.\n\nOwn.');
    // 2 冊目も並びの順に当て、会話で切った冊だけ当てない
    const second = {
      id: 'b2',
      name: '',
      entries: [loreEntry({ keys: ['castle'], content: 'Two.' })],
    };
    expect(sent({ lorebooks: [own, second] })).toBe('Global.\n\nOwn.\n\nTwo.');
    expect(sent({ lorebooks: [{ ...own, off: true }, second] })).toBe('Global.\n\nTwo.');
  });
});
