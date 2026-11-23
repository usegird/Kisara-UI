import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearChat, duplicateChat, openChat, renameChat } from '@/store/chat/chat-library';
import { exportChat } from '@/store/chat/chat-transfer';
import { settleChatWrites, startChatPersist } from '@/store/persist/chat-persist';
import {
  createMemoryChatTables,
  installBrowserChatTables,
  listChatsIn,
  loadChatFrom,
  type BrowserChatTables,
} from '@/store/persist/chat-repo';
import { restoreChats } from '@/store/persist/chat-restore';
import { useChatStore } from '@/store/use-chat-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { chat, chatMessage } from '../helpers/llm';

const download = vi.hoisted(() => vi.fn<(text: string, name: string, type: string) => void>());
vi.mock('@/lib/download', () => ({ downloadText: download }));

const BROWSER = { kind: 'browser' } as const;
let tables: BrowserChatTables;
let stop: () => void;

function brokenRecord(): unknown {
  const good = chat([chatMessage('u', 'user', ['hello'])], { name: 'kept' });
  return { chat: { ...good, messages: [...good.messages, { id: 'a', role: 'assistant' }] } };
}

beforeEach(async () => {
  tables = createMemoryChatTables();
  installBrowserChatTables(tables);
  useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'workflow' }], activeId: 'tab-1' });
  stop = startChatPersist();
  await tables.chats.put('b1', brokenRecord());
});

afterEach(async () => {
  stop();
  await settleChatWrites();
  installBrowserChatTables(null);
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  download.mockReset();
});

describe('壊れた会話', () => {
  it('開かず、置き場の本文も変えない。一覧からは消さない', async () => {
    expect(await openChat('b1', BROWSER)).toBe('broken');
    expect(useChatStore.getState().chats.b1).toBeUndefined();
    expect((await listChatsIn(BROWSER)).map((meta) => meta.id)).toEqual(['b1']);
    expect(await tables.chats.get('b1')).toEqual(brokenRecord());
    await expect(loadChatFrom('b1', BROWSER)).rejects.toThrow();
  });

  it('タブを戻すときは空の会話で始めず、壊れていることを出す', async () => {
    useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'b1' }] });
    await restoreChats();
    expect(useChatStore.getState().chats.b1).toBeUndefined();
    expect(useChatStore.getState().pending.b1).toEqual({ kind: 'broken' });
    expect(await tables.chats.get('b1')).toEqual(brokenRecord());
  });

  it('名前の変更と複製はしない', async () => {
    expect(await renameChat('b1', BROWSER, 'renamed')).toBe('failed');
    expect(await duplicateChat('b1', BROWSER)).toBe('broken');
    expect(await tables.chats.keys()).toEqual(['b1']);
  });

  it('書き出しは置き場の 1 件をそのまま書く', async () => {
    expect(await exportChat('b1', BROWSER)).toBe(true);
    const [text, name] = download.mock.calls[0] ?? [];
    expect(JSON.parse(String(text))).toEqual(brokenRecord());
    expect(name).toBe('kept.broken.json');
  });

  it('クリアすると名前を残した空の会話になり、壊れていたタブにも出す', async () => {
    useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'b1' }] });
    await restoreChats();
    expect(await clearChat('b1', BROWSER)).toBe('done');
    const cleared = await loadChatFrom('b1', BROWSER);
    expect(cleared?.name).toBe('kept');
    expect(cleared?.messages).toEqual([]);
    expect(useChatStore.getState().pending.b1).toBeUndefined();
    expect(useChatStore.getState().chats.b1?.name).toBe('kept');
  });

  it('読み込みの例外は空の会話で始めない', async () => {
    installBrowserChatTables({
      ...tables,
      chats: { ...tables.chats, get: () => Promise.reject(new Error('busy')) },
    });
    useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'b1' }] });
    await restoreChats();
    expect(useChatStore.getState().chats.b1).toBeUndefined();
    expect(useChatStore.getState().pending.b1).toEqual({ kind: 'failed' });
  });
});
