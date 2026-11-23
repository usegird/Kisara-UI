// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { CardFieldsSection } from '@/components/llm/prompt/CardFieldsSection';
import { memoryTable } from '@/store/persist/chat-repo';
import { useChatStore } from '@/store/use-chat-store';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { chat, loreEntry } from '../helpers/llm';

const fields = {
  ...EMPTY_CHARACTER,
  name: 'Aria',
  firstMes: 'Hello there.',
  alternateGreetings: ['Hi.'],
  creatorNotes: 'Made for tests.',
};

beforeEach(() => {
  installPresetTable(memoryTable());
  installDictionaryTable(memoryTable());
  useDictionariesStore.setState({ dictionaries: {} });
  useSettingsStore.setState({ dialogLayouts: {} });
  const lorebooks = [
    { id: 'b1', name: '', entries: [loreEntry({ keys: ['castle'], content: 'A castle.' })] },
  ];
  const preset = usePresetsStore.getState().add('Aria', fields, null, lorebooks);
  useChatStore.setState({
    chats: {
      c1: chat([], { preset: { id: preset.id, name: 'Aria' }, character: fields, lorebooks }),
      c2: chat(),
    },
  });
});

afterEach(() => {
  cleanup();
  installPresetTable(null);
  installDictionaryTable(null);
  usePresetsStore.setState({ presets: {} });
});

const presetOf = () => Object.values(usePresetsStore.getState().presets)[0];
const booksOf = () => useChatStore.getState().chats.c1?.lorebooks ?? [];
const bookOf = () => booksOf()[0];

describe('カードの欄', () => {
  it('プリセットとリンクしていない会話でも出し、新規作成で会話に辞書を作る（表には置かない）', () => {
    render(<CardFieldsSection chatId="c2" />);
    expect(screen.getByRole('heading', { name: 'コメント' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /この会話で使う$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新規作成' }));
    expect(useChatStore.getState().chats.c2?.lorebooks).toMatchObject([
      { name: '新しい辞書', entries: [] },
    ]);
    expect(useDictionariesStore.getState().dictionaries).toEqual({});
    expect(useChatStore.getState().chats.c2?.preset).toBeNull();
    expect(screen.getByRole('dialog', { name: '新しい辞書' })).toBeTruthy();
  });

  it('コメント・初期メッセージ・変数・追加辞書の順にカードで並べ、コメントは会話の写しに書く', () => {
    render(<CardFieldsSection chatId="c1" />);
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'コメント',
      '初期メッセージ',
      '変数・置換',
      '個別追加辞書',
    ]);
    expect(screen.getByText('1 項目')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'コメント' }), {
      target: { value: 'Edited.' },
    });
    expect(useChatStore.getState().chats.c1?.character?.creatorNotes).toBe('Edited.');
    expect(presetOf()?.fields.creatorNotes).toBe('Made for tests.');
  });

  it('追加辞書は機能のタブと同じダイアログで直し、名前と項目を OK で会話の辞書に書く', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Aria を編集' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: '名前' }), {
      target: { value: 'Aria book' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '追加' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(bookOf()?.name).toBe('Aria book');
    expect(bookOf()?.entries).toHaveLength(2);
    expect(presetOf()?.lorebooks[0]?.entries).toHaveLength(1);
  });

  it('ダイアログの削除で会話の辞書を外す（プリセットは変えない）', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Aria を編集' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(booksOf()).toEqual([]);
    expect(presetOf()?.lorebooks[0]?.entries).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Aria を編集' })).toBeNull();
    expect(screen.getByRole('button', { name: 'jsonを開く' })).toBeTruthy();
  });

  it('辞書があっても、新規作成は並びの最後に 1 冊足して開く（置き換えない）', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: '新規作成' }));
    expect(booksOf().map((book) => book.name)).toEqual(['', '新しい辞書']);
    expect(booksOf()[0]?.entries).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: '新しい辞書' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByRole('button', { name: 'Aria を編集' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新しい辞書 を編集' })).toBeTruthy();
    expect(presetOf()?.lorebooks).toHaveLength(1);
  });

  it('初期メッセージのセットで、見ている本文を直前の応答にする', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'チャット欄にセット' }));
    const messages = useChatStore.getState().chats.c1?.messages ?? [];
    expect(messages.map((message) => [message.role, message.candidates[0]?.content])).toEqual([
      ['assistant', 'Hello there.'],
    ]);
  });

  it('初期メッセージは ‹ N/M › で切り替え、最後に本文があれば › で空の欄を開き、打つと 1 件足す', () => {
    render(<CardFieldsSection chatId="c1" />);
    const field = () =>
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: '初期メッセージ' });
    const next = () => screen.getByRole('button', { name: '次の候補' });
    const character = () => useChatStore.getState().chats.c1?.character;
    expect(field().value).toBe('Hello there.');
    expect(screen.getByText('1/2')).toBeTruthy();

    fireEvent.click(next());
    expect(field().value).toBe('Hi.');
    fireEvent.click(next());
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(field().value).toBe('');
    expect((next() as HTMLButtonElement).disabled).toBe(true);
    expect(character()?.alternateGreetings).toEqual(['Hi.']);

    fireEvent.change(field(), { target: { value: 'Hey.' } });
    expect(character()?.alternateGreetings).toEqual(['Hi.', 'Hey.']);

    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '前の候補' }));
    expect(character()?.alternateGreetings).toEqual(['Hi.']);
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('変数は {{user}}・{{char}} の値を直し、足した行の名前は確定で {{}} を付け、× で消す', () => {
    render(<CardFieldsSection chatId="c1" />);
    const value = (name: string) => screen.getByRole('textbox', { name: `${name} の値` });
    fireEvent.change(value('{{user}}'), { target: { value: 'ケイ' } });
    expect(useChatStore.getState().chats.c1?.persona?.name).toBe('ケイ');
    fireEvent.change(value('{{char}}'), { target: { value: 'ミナ' } });
    expect(useChatStore.getState().chats.c1?.character?.name).toBe('ミナ');

    fireEvent.click(screen.getByRole('button', { name: '変数を足す' }));
    const name = screen.getByRole('textbox', { name: '変数の名前' });
    fireEvent.change(name, { target: { value: 'place' } });
    fireEvent.blur(name);
    const variables = () => useChatStore.getState().chats.c1?.character?.variables ?? [];
    expect(variables().map((item) => item.name)).toEqual(['{{place}}']);
    fireEvent.click(screen.getByRole('button', { name: '{{place}} を消す' }));
    expect(variables()).toEqual([]);
  });

  it('戻すを入れても左右の文字はそのまま。左は {{}} を外した元の文字、右は送る文字', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: '変数を足す' }));
    const left = () => screen.getByRole<HTMLInputElement>('textbox', { name: '変数の名前' });
    fireEvent.change(left(), { target: { value: 'アオバネ' } });
    fireEvent.blur(left());
    fireEvent.change(screen.getByRole('textbox', { name: '{{アオバネ}} の値' }), {
      target: { value: '青い鳥' },
    });
    const row = () => useChatStore.getState().chats.c1?.character?.variables?.[0];
    const box = (label: string) => screen.getByRole('checkbox', { name: `${label} を戻す` });
    fireEvent.click(box('{{アオバネ}}'));
    expect(row()).toMatchObject({ name: '青い鳥', value: 'アオバネ', restore: true });
    expect(left().value).toBe('アオバネ');
    const right = screen.getByRole<HTMLInputElement>('textbox', { name: 'アオバネ の値' });
    expect(right.value).toBe('青い鳥');
    fireEvent.change(right, { target: { value: '{{ミドリ}}' } });
    fireEvent.blur(right);
    expect(row()?.name).toBe('ミドリ');
    fireEvent.click(box('アオバネ'));
    expect(row()).toMatchObject({ name: '{{アオバネ}}', value: 'ミドリ' });
    expect(row()?.restore).toBeUndefined();
  });

  it('戻すの行の空の欄は、左に元の文字の例「りんご」、右に送る文字の例「赤い果物A」を薄く出す', () => {
    render(<CardFieldsSection chatId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: '変数を足す' }));
    const name = () => screen.getByRole('textbox', { name: '変数の名前' });
    expect(name().getAttribute('placeholder')).toBe('{{name}}');
    fireEvent.click(screen.getByRole('checkbox', { name: 'を戻す' }));
    expect(name().getAttribute('placeholder')).toBe('りんご');
    const value = screen.getByRole('textbox', { name: 'の値' });
    expect(value.getAttribute('placeholder')).toBe('赤い果物A');
  });

  it('「戻す」は変数・置換の見出しと同じ行に出す', () => {
    render(<CardFieldsSection chatId="c1" />);
    const heading = screen.getByRole('heading', { name: '変数・置換' });
    expect(heading.parentElement?.textContent).toBe('変数・置換戻す');
  });

  it('見出しの右端に「戻す」と出し、{{user}}・{{char}} の戻すは押せない', () => {
    render(<CardFieldsSection chatId="c1" />);
    expect(screen.getByText('戻す')).toBeTruthy();
    const value = (macro: string) => screen.getByRole('textbox', { name: `${macro} の値` });
    expect(value('{{char}}').getAttribute('placeholder')).toBe('Assistant');

    for (const macro of ['{{user}}', '{{char}}']) {
      const box = screen.getByRole<HTMLInputElement>('checkbox', { name: `${macro} を戻す` });
      expect(box.disabled).toBe(true);
      expect(box.checked).toBe(false);
    }
    expect(screen.queryByRole('textbox', { name: '{{char}} の別名' })).toBeNull();
  });

  it('追加辞書のチェックを外すと、この会話でその辞書を当てない', () => {
    render(<CardFieldsSection chatId="c1" />);
    const box = screen.getByRole('checkbox', { name: 'Aria をこの会話で使う' });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(bookOf()?.off).toBe(true);
    fireEvent.click(box);
    expect(bookOf()?.off).toBeUndefined();
  });
});
