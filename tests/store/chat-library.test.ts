import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { serializeConversations } from '@/chat/conversation-file';
import { openChatFile } from '@/components/llm/chat-list/chat-file-picker';
import type { ChatsPort } from '@/port/comfy-port';
import {
  clearChat,
  deleteChat,
  duplicateChat,
  forkChat,
  openChat,
  renameChat,
  restoreChats,
  startNewChatHere,
} from '@/store/chat/chat-library';
import { importChatFile } from '@/store/chat/chat-transfer';
import { flushChat, settleChatWrites, startChatPersist } from '@/store/persist/chat-persist';
import {
  createMemoryChatTables,
  installBrowserChatTables,
  listAllChats,
  listChatsIn,
  loadChatFrom,
  saveChatTo,
} from '@/store/persist/chat-repo';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useChatStore } from '@/store/use-chat-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { connectComfy } from '../helpers/connection';
import { chat, chatMessage } from '../helpers/llm';

// ─────────────────────────────
// 残した会話の出し入れと ComfyUI の控え。ComfyUI のユーザーフォルダは作り物にする。
// ─────────────────────────────

const BROWSER = { kind: 'browser' } as const;
const COMFY = { kind: 'comfy', baseUrl: 'http://comfy' } as const;
const BOTH = { kind: 'both', baseUrl: 'http://comfy' } as const;

/** ユーザーフォルダの代わり。ファイルの名前から中身へ */
function fakeChats(files: Map<string, string>): ChatsPort {
  return {
    listMetas: () =>
      Promise.resolve(
        [...files.entries()]
          .filter(([name]) => name.endsWith('.meta.json'))
          .map(([, text]) => JSON.parse(text) as unknown),
      ),
    fetchChat: (_baseUrl, id) => {
      const text = files.get(`${id}.json`);
      return Promise.resolve(text === undefined ? null : (JSON.parse(text) as unknown));
    },
    saveChat: (_baseUrl, { id, body, meta }) => {
      files.set(`${id}.json`, body);
      files.set(`${id}.meta.json`, meta);
      return Promise.resolve();
    },
    removeChat: (_baseUrl, id) => {
      files.delete(`${id}.json`);
      files.delete(`${id}.meta.json`);
      return Promise.resolve();
    },
    isFull: () => false,
  };
}

let files: Map<string, string>;
let stop: () => void;

beforeEach(() => {
  installBrowserChatTables(createMemoryChatTables());
  files = new Map();
  installComfyPort({ ...comfyPort(), chats: fakeChats(files) });
  useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'workflow' }], activeId: 'tab-1' });
  stop = startChatPersist();
});

afterEach(() => {
  stop();
  useSettingsStore.setState({ chatComfyBackup: false, baseUrl: '' });
  useConnectionStore.setState({ status: 'disconnected' });
  installBrowserChatTables(null);
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
});

const saved = chat([chatMessage('u', 'user', ['hello'])], { name: 'kept' });

describe('開く', () => {
  it('空のタブを会話のタブに替えて開き、もう一度開くとそのタブへ移る', async () => {
    await saveChatTo('c1', saved, BROWSER);
    expect(await openChat('c1', BROWSER)).toBe('opened');
    expect(useTabsStore.getState().tabs).toEqual([{ id: 'tab-1', kind: 'chat', chatId: 'c1' }]);
    expect(useChatStore.getState().chats.c1?.name).toBe('kept');
    expect(await openChat('c1', BROWSER)).toBe('opened');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
  });

  it('無い会話は開かない', async () => {
    expect(await openChat('nope', BROWSER)).toBe('missing');
  });
});

describe('会話の左の列から', () => {
  it('このタブの会話を替え、前の会話は手放すが置き場に残す', async () => {
    await saveChatTo('h1', saved, BROWSER);
    await saveChatTo('h2', chat([chatMessage('u', 'user', ['two'])]), BROWSER);
    await openChat('h1', BROWSER);
    expect(await openChat('h2', BROWSER, { here: true })).toBe('opened');
    expect(useTabsStore.getState().tabs).toEqual([
      { id: 'tab-1', kind: 'chat', chatId: 'h2', chatComfyUrl: undefined },
    ]);
    expect(useChatStore.getState().chats.h1).toBeUndefined();
    expect(await loadChatFrom('h1', BROWSER)).not.toBeNull();
  });

  it('新しい会話はこのタブを替える。今の会話にメッセージが無くても、押すたびに新しく作る', async () => {
    await saveChatTo('h3', saved, BROWSER);
    await openChat('h3', BROWSER);
    startNewChatHere();
    const [tab] = useTabsStore.getState().tabs;
    expect(tab?.chatId).not.toBe('h3');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    startNewChatHere();
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0]?.chatId).not.toBe(tab?.chatId);
  });
});

describe('新しい会話', () => {
  it('ComfyUI につないで控えを書く設定でも、いつもブラウザに置く', () => {
    connectComfy({ chatComfyBackup: true });
    const id = useChatStore.getState().add();
    expect(useChatStore.getState().places[id] ?? BROWSER).toEqual(BROWSER);
  });
});

describe('ComfyUI の控え', () => {
  /** 開いた会話を変えて、書き込みを済ませる */
  async function edit(id: string, name: string): Promise<void> {
    useChatStore.getState().update(id, { name });
    await flushChat(id);
    await settleChatWrites();
  }

  it('控えを書く設定でつないでいれば、ブラウザに書いた後で控えも書き、置き場を両方にする', async () => {
    connectComfy({ chatComfyBackup: true });
    await saveChatTo('b1', saved, BROWSER);
    await openChat('b1', BROWSER);
    // 設定を入れただけでは書かない（次に保存したときに書く）
    expect(files.has('b1.json')).toBe(false);
    await edit('b1', 'edited');
    expect((await loadChatFrom('b1', COMFY))?.name).toBe('edited');
    expect(useChatStore.getState().places.b1).toEqual(BOTH);
    expect(useTabsStore.getState().tabs[0]).toMatchObject({ chatBoth: true });
  });

  it('設定を外していれば控えを書かない', async () => {
    connectComfy({ chatComfyBackup: false });
    await saveChatTo('b2', saved, BROWSER);
    await openChat('b2', BROWSER);
    await edit('b2', 'edited');
    expect(files.size).toBe(0);
    expect((await loadChatFrom('b2', BROWSER))?.name).toBe('edited');
  });

  it('つないでいない間の控えは、つないだときに書く', async () => {
    useSettingsStore.setState({ chatComfyBackup: true, baseUrl: 'http://comfy' });
    await saveChatTo('b3', saved, BROWSER);
    await openChat('b3', BROWSER);
    await edit('b3', 'offline');
    expect(files.size).toBe(0);
    expect(useChatStore.getState().saveStates.b3).toBe('saved');
    useConnectionStore.setState({ status: 'connected' });
    await settleChatWrites();
    expect((await loadChatFrom('b3', COMFY))?.name).toBe('offline');
  });

  it('控えだけの会話を開くとブラウザに写し、置き場を両方にする', async () => {
    connectComfy({ chatComfyBackup: false });
    await saveChatTo('b4', saved, COMFY);
    expect(await openChat('b4', COMFY)).toBe('opened');
    await flushChat('b4');
    await settleChatWrites();
    expect(await loadChatFrom('b4', BROWSER)).not.toBeNull();
    expect(useChatStore.getState().places.b4).toEqual(BOTH);
  });
  it('消すとブラウザから消し、控えはつないでいても残す', async () => {
    connectComfy({ chatComfyBackup: true });
    await saveChatTo('b5', saved, BOTH);
    expect(await deleteChat('b5')).toBe('done');
    expect(files.has('b5.json')).toBe(true);
    expect(await loadChatFrom('b5', BROWSER)).toBeNull();

    await saveChatTo('b6', saved, BOTH);
    useConnectionStore.setState({ status: 'disconnected' });
    expect(await deleteChat('b6')).toBe('done');
    expect(await loadChatFrom('b6', BROWSER)).toBeNull();
    expect(files.has('b6.json')).toBe(true);
  });
});

describe('控えから会話を戻す', () => {
  it('ブラウザに無ければ足し、控えの方が新しければ置き換え、開いている会話は写さない', async () => {
    connectComfy({ chatComfyBackup: false });
    await saveChatTo('r1', { ...saved, name: 'only-backup' }, COMFY);
    await saveChatTo('r2', { ...saved, name: 'old', updatedAt: 1 }, BROWSER);
    await saveChatTo('r2', { ...saved, name: 'new', updatedAt: 2 }, COMFY);
    await saveChatTo('r3', { ...saved, name: 'local', updatedAt: 9 }, BROWSER);
    await saveChatTo('r3', { ...saved, name: 'stale', updatedAt: 3 }, COMFY);
    await saveChatTo('r4', { ...saved, name: 'open', updatedAt: 1 }, BROWSER);
    await openChat('r4', BROWSER);
    await saveChatTo('r4', { ...saved, name: 'backup', updatedAt: 5 }, COMFY);

    expect(await restoreChats()).toEqual({ added: 1, updated: 1, failed: false });
    expect((await loadChatFrom('r1', BROWSER))?.name).toBe('only-backup');
    expect((await loadChatFrom('r2', BROWSER))?.name).toBe('new');
    expect((await loadChatFrom('r3', BROWSER))?.name).toBe('local');
    expect(useChatStore.getState().chats.r4?.name).toBe('open');
  });

  it('設定のセッション上限を超える控えは写さず、その数を返す', async () => {
    connectComfy({ chatComfyBackup: false });
    useSettingsStore.setState({ chatMaxMegabytes: 1 });
    const big = chatMessage('m1', 'user', ['x'.repeat(2 * 1024 * 1024)]);
    await saveChatTo('big', { ...saved, name: 'big', messages: [big] }, COMFY);
    await saveChatTo('small', { ...saved, name: 'small' }, COMFY);
    expect(await restoreChats()).toEqual({ added: 1, updated: 0, failed: false, tooLarge: 1 });
    expect(await loadChatFrom('big', BROWSER)).toBeNull();
    useSettingsStore.setState({ chatMaxMegabytes: 10 });
  });

  it('つないでいなければ戻せない', async () => {
    expect((await restoreChats()).failed).toBe(true);
  });
});

describe('消す・名前を変える', () => {
  it('ブラウザと控えに置いた会話が食い違えば、最後に変えた時刻の新しい方を読む', async () => {
    await saveChatTo('c6', { ...saved, name: 'old', updatedAt: 1 }, BROWSER);
    await saveChatTo('c6', { ...saved, name: 'new', updatedAt: 2 }, COMFY);
    expect((await loadChatFrom('c6', BOTH))?.name).toBe('new');
    const listed = await listAllChats('http://comfy');
    expect(listed.filter((meta) => meta.id === 'c6')).toHaveLength(1);
    expect(listed.find((meta) => meta.id === 'c6')?.name).toBe('new');
  });

  it('消すと開いているタブも閉じ、置き場から消える', async () => {
    await saveChatTo('c3', saved, BROWSER);
    await openChat('c3', BROWSER);
    expect(await deleteChat('c3')).toBe('done');
    expect(await loadChatFrom('c3', BROWSER)).toBeNull();
    expect(useTabsStore.getState().tabs.some((tab) => tab.chatId === 'c3')).toBe(false);
  });

  it('開いていない会話の名前を変えると、置き場の会話を書き換える', async () => {
    await saveChatTo('c4', saved, BROWSER);
    expect(await renameChat('c4', BROWSER, 'renamed')).toBe('done');
    expect((await loadChatFrom('c4', BROWSER))?.name).toBe('renamed');
  });
});

describe('複製する・クリアする', () => {
  it('複製は新しい id でブラウザに写し、名前にコピーを添える。元は残る', async () => {
    await saveChatTo('d1', { ...saved, summary: { content: 's', upTo: 'u' } }, BROWSER);
    expect(await duplicateChat('d1', BROWSER)).toBe('done');
    const listed = await listChatsIn(BROWSER);
    expect(listed).toHaveLength(2);
    const copy = listed.find((meta) => meta.id !== 'd1');
    expect(copy?.name).toBe('kept のコピー');
    const loaded = copy === undefined ? null : await loadChatFrom(copy.id, BROWSER);
    expect(loaded?.messages.map((message) => message.id)).toEqual(['u']);
    expect(loaded?.summary?.content).toBe('s');
    expect((await loadChatFrom('d1', BROWSER))?.name).toBe('kept');
  });

  it('開いている会話の複製は、書いていない分も含めて写す', async () => {
    await saveChatTo('d2', saved, BROWSER);
    await openChat('d2', BROWSER);
    useChatStore.getState().update('d2', { name: 'edited' });
    expect(await duplicateChat('d2', BROWSER)).toBe('done');
    const names = (await listChatsIn(BROWSER)).map((meta) => meta.name).sort();
    expect(names).toEqual(['edited', 'edited のコピー']);
  });

  it('開いていない会話をクリアすると、発言と要約を消して名前は残す', async () => {
    await saveChatTo('k1', { ...saved, summary: { content: 's', upTo: 'u' } }, BROWSER);
    expect(await clearChat('k1', BROWSER)).toBe('done');
    const loaded = await loadChatFrom('k1', BROWSER);
    expect(loaded?.messages).toEqual([]);
    expect(loaded?.summary).toBeUndefined();
    expect(loaded?.name).toBe('kept');
    expect((await listChatsIn(BROWSER)).map((meta) => meta.id)).toEqual(['k1']);
  });

  it('開いている会話をクリアすると、プリセットの欄の最初の発言だけを写し直す', async () => {
    const character = { ...EMPTY_CHARACTER, name: 'Aria', firstMes: 'Hello.' };
    await saveChatTo('k2', { ...saved, character }, BROWSER);
    await openChat('k2', BROWSER);
    expect(await clearChat('k2', BROWSER)).toBe('done');
    const messages = useChatStore.getState().chats.k2?.messages ?? [];
    expect(messages.map((message) => message.role)).toEqual(['assistant']);
    expect(messages[0]?.candidates[0]?.content).toBe('Hello.');
  });

  it('受け取り中の会話はクリアしない', async () => {
    const receiving = chatMessage('a', 'assistant', ['partial']);
    const streaming = {
      ...receiving,
      candidates: receiving.candidates.map((candidate) => ({
        ...candidate,
        end: { kind: 'streaming' as const },
      })),
    };
    await saveChatTo('k3', saved, BROWSER);
    await openChat('k3', BROWSER);
    useChatStore.setState((state) => ({
      chats: { ...state.chats, k3: chat([...saved.messages, streaming], { name: 'kept' }) },
    }));
    expect(await clearChat('k3', BROWSER)).toBe('streaming');
    expect(useChatStore.getState().chats.k3?.messages).toHaveLength(2);
  });
});

describe('フォークする', () => {
  const turns = chat(
    [
      chatMessage('u1', 'user', ['first']),
      chatMessage('a1', 'assistant', ['answer']),
      chatMessage('u2', 'user', ['second']),
      chatMessage('a2', 'assistant', ['later']),
    ],
    { name: 'kept' },
  );

  it('応答までを残した写しを新しいタブで開く。元は変えない', async () => {
    await saveChatTo('f1', turns, BROWSER);
    await openChat('f1', BROWSER);
    expect(await forkChat('f1', 'u2')).toBe('failed');
    expect(await forkChat('f1', 'a1')).toBe('done');

    const { tabs, activeId } = useTabsStore.getState();
    const forkId = tabs.find((tab) => tab.id === activeId)?.chatId;
    expect(forkId).toBeDefined();
    expect(forkId).not.toBe('f1');
    const id = forkId ?? '';
    const state = useChatStore.getState();
    expect(state.chats[id]?.name).toBe('kept のフォーク');
    expect(state.chats[id]?.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(state.drafts[id] ?? '').toBe('');
    expect((await loadChatFrom(id, BROWSER))?.messages).toHaveLength(2);
    expect(state.chats.f1?.messages).toHaveLength(4);
    expect(tabs.map((tab) => tab.chatId)).toEqual(['f1', id]);
  });

  it('受け取り中の会話はフォークしない', async () => {
    const receiving = chatMessage('a3', 'assistant', ['partial']);
    const streaming = {
      ...receiving,
      candidates: receiving.candidates.map((candidate) => ({
        ...candidate,
        end: { kind: 'streaming' as const },
      })),
    };
    await saveChatTo('f2', turns, BROWSER);
    await openChat('f2', BROWSER);
    useChatStore.setState((state) => ({
      chats: { ...state.chats, f2: chat([...turns.messages, streaming], { name: 'kept' }) },
    }));
    expect(await forkChat('f2', 'a1')).toBe('streaming');
    expect(await listChatsIn(BROWSER)).toHaveLength(1);
  });
});

describe('読み込む', () => {
  it('会話 1 つのファイルはブラウザに置いて開く', async () => {
    const file = new File([serializeConversations([{ id: 'c', chat: saved }])], 'a.json');
    const result = await importChatFile(file);
    expect(result.added).toHaveLength(1);
    expect(await listChatsIn(BROWSER)).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0]?.kind).toBe('chat');
  });

  it('読めない形は何も足さない', async () => {
    const result = await importChatFile(new File(['{}'], 'x.json'));
    expect(result.unreadable).toBe(true);
    expect(await listChatsIn(BROWSER)).toEqual([]);
  });
  it('画面へ落としたファイルは、会話のファイルなら開き、ワークフローなら任せる', async () => {
    const workflow = new File([JSON.stringify({ nodes: [], links: [] })], 'w.json');
    expect(await openChatFile(workflow)).toBe(false);
    expect(await listChatsIn(BROWSER)).toEqual([]);

    const file = new File([serializeConversations([{ id: 'c', chat: saved }])], 'a.json');
    expect(await openChatFile(file)).toBe(true);
    expect(await listChatsIn(BROWSER)).toHaveLength(1);
  });
});
