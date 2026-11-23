import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { settleChatWrites, startChatPersist } from '@/store/persist/chat-persist';
import {
  createMemoryChatTables,
  installBrowserChatTables,
  listChatsIn,
  loadChatFrom,
  type BrowserChatTables,
} from '@/store/persist/chat-repo';
import { restoreChats } from '@/store/persist/chat-restore';
import { buildLayout, parseLayout } from '@/store/persist/session-format';
import { useChatStore } from '@/store/use-chat-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { chat, chatMessage } from '../helpers/llm';

const BROWSER = { kind: 'browser' } as const;
let tables: BrowserChatTables;

beforeEach(() => {
  tables = createMemoryChatTables();
  installBrowserChatTables(tables);
});

afterEach(() => {
  vi.useRealTimers();
  installBrowserChatTables(null);
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
});

describe('会話のタブの並び', () => {
  it('会話のタブは会話の id と ComfyUI の接続先ごと並びに載り、画像のタブは載らない', () => {
    const layout = buildLayout(
      [
        { id: 'tab-1', kind: 'workflow', runSession: 's1' },
        { id: 'tab-2', kind: 'chat', chatId: 'c1' },
        { id: 'tab-3', kind: 'chat', chatId: 'c2', chatComfyUrl: 'http://comfy' },
        { id: 'tab-4', kind: 'image' },
      ],
      'tab-2',
    );
    const parsed = parseLayout(JSON.parse(JSON.stringify(layout)));
    expect(parsed?.tabs.map((tab) => tab.id)).toEqual(['tab-1', 'tab-2', 'tab-3']);
    expect(parsed?.tabs[2]).toMatchObject({ chatId: 'c2', chatComfyUrl: 'http://comfy' });
  });
});

describe('会話の書き込み', () => {
  it('変わった会話を間引いて書き、一覧の項目も書く。読み戻すと同じ会話に戻る', async () => {
    vi.useFakeTimers();
    const stop = startChatPersist();
    const saved = chat([chatMessage('u1', 'user', ['hi there'])], { name: 'kept' });
    useChatStore.getState().put('c1', saved);
    await vi.advanceTimersByTimeAsync(1000);
    await settleChatWrites();
    stop();

    expect(useChatStore.getState().saveStates.c1).toBe('saved');
    const [meta] = await listChatsIn(BROWSER);
    expect(meta).toMatchObject({ id: 'c1', name: 'kept', head: 'hi there' });
    expect(meta?.size).toBeGreaterThan(0);

    useChatStore.setState({ chats: {}, places: {} });
    useTabsStore.setState({
      tabs: [{ id: 'tab-9', kind: 'chat', chatId: 'c1' }],
      activeId: 'tab-9',
    });
    await restoreChats();
    expect(useChatStore.getState().chats.c1).toEqual(saved);
  });

  it('タブを閉じても会話は消さず、書いていない分を書いてから手放す', async () => {
    vi.useFakeTimers();
    useChatStore.getState().put('c2', chat());
    const stop = startChatPersist();
    useChatStore.getState().update('c2', { name: 'late' });
    useChatStore.getState().unload('c2');
    await settleChatWrites();
    stop();
    expect((await loadChatFrom('c2', BROWSER))?.name).toBe('late');
  });

  it('プロンプトの直しだけでは書かず、送ったときに一緒に書く', async () => {
    vi.useFakeTimers();
    const stop = startChatPersist();
    useChatStore.getState().put('c3', chat([chatMessage('u1', 'user', ['hi'])]));
    await vi.advanceTimersByTimeAsync(1000);
    await settleChatWrites();
    useChatStore.getState().update('c3', { persona: { name: 'edited', description: '' } });
    await vi.advanceTimersByTimeAsync(1000);
    await settleChatWrites();
    expect((await loadChatFrom('c3', BROWSER))?.persona).toBeNull();

    const sent = useChatStore.getState().chats.c3!;
    useChatStore.getState().put('c3', {
      ...sent,
      messages: [...sent.messages, chatMessage('a1', 'assistant', ['ok'])],
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settleChatWrites();
    stop();
    expect((await loadChatFrom('c3', BROWSER))?.persona?.name).toBe('edited');
  });

  it('容量の不足で書けなければ、送るのを止める印を付ける', async () => {
    vi.useFakeTimers();
    installBrowserChatTables({
      ...tables,
      chats: {
        ...tables.chats,
        put: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
      },
    });
    const stop = startChatPersist();
    useChatStore.getState().put('c3', chat([chatMessage('u', 'user', ['x'])]));
    await vi.advanceTimersByTimeAsync(1000);
    await settleChatWrites();
    stop();
    expect(useChatStore.getState().saveStates.c3).toBe('full');
  });
});

describe('ComfyUI に置いた会話', () => {
  it('並びから戻すときは読まずに、つなぐのを待つ', async () => {
    useTabsStore.setState({
      tabs: [{ id: 'tab-1', kind: 'chat', chatId: 'c4', chatComfyUrl: 'http://comfy' }],
      activeId: 'tab-1',
    });
    await restoreChats();
    expect(useChatStore.getState().chats.c4).toBeUndefined();
    expect(useChatStore.getState().pending.c4).toEqual({
      kind: 'waiting',
      baseUrl: 'http://comfy',
    });
  });
});
