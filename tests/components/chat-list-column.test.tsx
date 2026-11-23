// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChatListColumn } from '@/components/llm/chat-list/ChatListColumn';
import { settleChatWrites, startChatPersist } from '@/store/persist/chat-persist';
import {
  createMemoryChatTables,
  installBrowserChatTables,
  loadChatFrom,
  saveChatTo,
} from '@/store/persist/chat-repo';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { chat, chatMessage } from '../helpers/llm';

const BROWSER = { kind: 'browser' } as const;
let stop: () => void;

beforeEach(async () => {
  installBrowserChatTables(createMemoryChatTables());
  useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'workflow' }], activeId: 'tab-1' });
  stop = startChatPersist();
  await saveChatTo('c1', chat([chatMessage('u', 'user', ['hello'])], { name: 'kept' }), BROWSER);
});

afterEach(async () => {
  cleanup();
  stop();
  await settleChatWrites();
  installBrowserChatTables(null);
});

async function openRowMenu(): Promise<void> {
  fireEvent.contextMenu(await screen.findByTitle('kept'));
}

describe('行のメニュー', () => {
  it('エクスポートの上に会話を複製、下に会話をクリアを出す', async () => {
    render(<ChatListColumn activeChatId="none" />);
    await openRowMenu();
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual([
      '別のタブで開く',
      '名前を変更',
      '会話を複製',
      'エクスポート',
      '会話をクリア',
      '削除',
    ]);
  });

  it('別のタブで開くは、今の会話のタブを替えずに新しいタブで開く（アイコンもメニューも）', async () => {
    useTabsStore.setState({
      tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'now' }],
      activeId: 'tab-1',
    });
    render(<ChatListColumn activeChatId="now" />);
    fireEvent.click(await screen.findByRole('button', { name: 'kept を別のタブで開く' }));
    await waitFor(() => {
      const { tabs, activeId } = useTabsStore.getState();
      expect(tabs.map((tab) => tab.chatId)).toEqual(['now', 'c1']);
      expect(tabs.find((tab) => tab.id === activeId)?.chatId).toBe('c1');
    });
  });
});

describe('引き出しで出しているとき', () => {
  beforeEach(() => {
    useSettingsStore.setState({ chatSidebarCollapsed: true });
    useChatLibraryStore.setState({ drawerOpen: true });
    useTabsStore.setState({
      tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'now' }],
      activeId: 'tab-1',
    });
  });

  afterEach(() => {
    useSettingsStore.setState({ chatSidebarCollapsed: false });
    useChatLibraryStore.setState({ drawerOpen: false });
  });

  it('行のメニュー（一覧の外に描く）を押しても Esc でも引っ込めず、別のタブで開くが効く', async () => {
    render(<ChatListColumn activeChatId="now" />);
    fireEvent.click(await screen.findByRole('button', { name: 'kept のメニュー' }));
    const item = await screen.findByRole('menuitem', { name: '別のタブで開く' });
    fireEvent.keyDown(item, { key: 'Escape' });
    expect(useChatLibraryStore.getState().drawerOpen).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'kept のメニュー' }));
    const again = await screen.findByRole('menuitem', { name: '別のタブで開く' });
    fireEvent.pointerDown(again);
    fireEvent.click(again);
    await waitFor(() => {
      expect(useTabsStore.getState().tabs.map((tab) => tab.chatId)).toEqual(['now', 'c1']);
    });
  });

  it('一覧の外を押す・外で Esc を押すと引っ込める', async () => {
    render(<ChatListColumn activeChatId="now" />);
    await screen.findByTitle('kept');
    fireEvent.pointerDown(document.body);
    expect(useChatLibraryStore.getState().drawerOpen).toBe(false);

    useChatLibraryStore.setState({ drawerOpen: true });
    await screen.findByTitle('kept');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useChatLibraryStore.getState().drawerOpen).toBe(false);
  });
});

describe('行のメニューのクリア', () => {
  it('今の会話の行では、別のタブで開くのアイコンとメニューを押せない', async () => {
    render(<ChatListColumn activeChatId="c1" />);
    const icon = await screen.findByRole('button', { name: 'kept を別のタブで開く' });
    expect(icon.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'kept のメニュー' }));
    const item = await screen.findByRole('menuitem', { name: '別のタブで開く' });
    expect(item.getAttribute('aria-disabled')).toBe('true');
  });

  it('クリアは確かめてから発言を消す。取りやめれば消さない', async () => {
    render(<ChatListColumn activeChatId="none" />);
    await openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: '会話をクリア' }));
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }));
    expect((await loadChatFrom('c1', BROWSER))?.messages).toHaveLength(1);

    await openRowMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: '会話をクリア' }));
    expect(await screen.findByText('この会話をクリアしますか？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'クリアする' }));
    await waitFor(async () => {
      expect((await loadChatFrom('c1', BROWSER))?.messages).toEqual([]);
    });
  });
});
