// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { loreSourcesOf } from '@/chat/chat-sources';
import { compositionOf } from '@/chat/prompt-parse';
import { ChatPromptPanel } from '@/components/llm/side-panel/ChatPromptPanel';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { chat, chatMessage, loreEntry } from '../helpers/llm';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ loreDictionariesOn: true });
});

const withBook = chat([chatMessage('u1', 'user', ['hi'])], {
  prompt: compositionOf({}),
  lorebooks: [
    { id: 'b1', name: 'book', entries: [loreEntry({ keys: ['hi'], content: 'Hello.' })] },
  ],
});
const library = {
  dictionaries: {},
  enabledIds: [],
};

describe('動的追加辞書を切ったとき', () => {
  it('個別追加辞書も当てない', () => {
    expect(loreSourcesOf(withBook, library).map((source) => source.entries.length)).toEqual([1]);
    expect(loreSourcesOf(withBook, { ...library, on: false })).toEqual([]);
  });

  it('プロンプト構成に追加辞書の項目を出さない', () => {
    useChatStore.setState({ chats: { c1: withBook } });
    const { unmount } = render(<ChatPromptPanel chatId="c1" />);
    expect(screen.queryAllByText('追加辞書').length).toBeGreaterThan(0);
    unmount();
    useSettingsStore.setState({ loreDictionariesOn: false });
    render(<ChatPromptPanel chatId="c1" />);
    expect(screen.queryAllByText('追加辞書')).toEqual([]);
  });
});
