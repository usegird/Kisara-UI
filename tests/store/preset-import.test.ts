import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { chatImageId, chatLorebooks } from '@/chat/chat-sources';
import { appendTurn } from '@/chat/edit';
import { buildChatRequest } from '@/chat/request';
import type { Chat } from '@/chat/types';
import type { ChatRequestMessage } from '@/port/llm-port';
import { editCharacter, linkPreset, openCardFile } from '@/store/chat/preset-import';
import { memoryTable } from '@/store/persist/chat-repo';
import { avatarImageOf } from '@/store/use-avatars-store';
import { canSend, sourcesOf, useChatStore } from '@/store/use-chat-store';
import { installDictionaryTable, useDictionariesStore } from '@/store/use-dictionaries-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { installPresetTable, usePresetsStore } from '@/store/use-presets-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { llm, loreEntry, profile } from '../helpers/llm';
import { png, textChunk } from '../helpers/png';

// ─────────────────────────────
// キャラクターカードを開く。プリセットの一覧に足し、新しい会話で開く。
// ─────────────────────────────

function cardFile(name: string, data: Record<string, unknown>): File {
  const json = JSON.stringify({
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: { name, ...data },
  });
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return new File([png(textChunk('chara', encoded))], `${name}.png`, { type: 'image/png' });
}

/** 次に 1 件送るときの `messages`（送るときと同じく、今回のメッセージと受け取る側を足して組む） */
function sentMessages(chat: Chat): readonly ChatRequestMessage[] {
  return buildChatRequest(
    appendTurn(chat, { text: 'Q', userId: 'uq', assistantId: 'aq' }),
    llm(),
    sourcesOf(chat),
  ).messages;
}

beforeEach(() => {
  installPresetTable(memoryTable());
  installDictionaryTable(memoryTable());
  usePresetsStore.setState({ presets: {}, loaded: true });
  useDictionariesStore.setState({ dictionaries: {}, loaded: true });
  useLlmProfilesStore.setState({ profiles: [profile({ defaultModel: 'm' })] });
  // 接続の設定とモデルは全体で持つ（モデルが空なら接続の設定の既定）
  useSettingsStore.setState({ llmProfileId: 'p1', llmModel: '' });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  useTabsStore.setState({ tabs: [{ id: 'tab-1', kind: 'workflow' }], activeId: 'tab-1' });
});

describe('カードを開く', () => {
  it('プリセットに足し、リンクした新しい会話を挨拶つきで会話のタブに開く', async () => {
    const file = cardFile('Aria', { first_mes: 'Hi {{user}}', alternate_greetings: ['Hey'] });
    expect(await openCardFile(file)).toBe(true);

    const presets = Object.values(usePresetsStore.getState().presets);
    expect(presets.map((preset) => preset.name)).toEqual(['Aria']);
    expect(avatarImageOf(presets[0]?.imageId)).not.toBeNull();

    const tab = useTabsStore.getState().tabs.find((item) => item.kind === 'chat');
    const chat = tab?.chatId === undefined ? undefined : useChatStore.getState().chats[tab.chatId];
    expect(chat).toMatchObject({ name: 'Aria', preset: { id: presets[0]?.id, name: 'Aria' } });
    expect(chat?.messages[0]?.candidates.map((candidate) => candidate.content)).toEqual([
      'Hi User',
      'Hey',
    ]);
    // カードにある欄だけで組み、KisaraUI の初めの構成の項目は使わない。空の欄も有効で置く
    const ids = chat?.prompt.items.map((item) => item.id) ?? [];
    expect(ids).toContain('charDescription');
    expect(ids).not.toContain('tone');
    const enabled = (id: string) => chat?.prompt.items.find((item) => item.id === id)?.enabled;
    expect(enabled('charDescription')).toBe(true);
    expect(enabled('chatHistory')).toBe(true);
  });

  it('同じカードを 2 度開いても、プリセットは 1 つ', async () => {
    await openCardFile(cardFile('Aria', {}));
    await openCardFile(cardFile('Aria', {}));
    expect(Object.keys(usePresetsStore.getState().presets)).toHaveLength(1);
  });

  it('カードでないファイルは開かない', async () => {
    const file = new File([png(textChunk('workflow', '{}'))], 'w.png', { type: 'image/png' });
    expect(await openCardFile(file)).toBe(false);
    expect(Object.keys(useChatStore.getState().chats)).toHaveLength(0);
  });

  it('写したプリセットが消えても、会話は写しで送れる', async () => {
    await openCardFile(cardFile('Aria', { description: 'Knight.' }));
    const chat = Object.values(useChatStore.getState().chats)[0]!;
    usePresetsStore.setState({ presets: {} });
    expect(canSend(chat)).toBe(true);
    expect(sentMessages(chat)[0]?.content).toBe('Knight.');
  });

  it('使わない項目は持たない（作者のメモ・タグ）', async () => {
    await openCardFile(cardFile('Aria', { creator_notes: 'note', tags: ['a'] }));
    const preset = Object.values(usePresetsStore.getState().presets)[0]!;
    expect(preset.fields.name).toBe('Aria');
    expect(JSON.stringify(preset)).not.toContain('creator_notes');
  });
});

describe('利用者の情報', () => {
  it('名前を {{user}} に、説明を Persona Description に入れる（プリセットが無くても）', async () => {
    await openCardFile(cardFile('Aria', { description: 'Knight of {{user}}.' }));
    const chat = Object.values(useChatStore.getState().chats)[0]!;
    const withPersona = {
      ...chat,
      persona: { name: 'Kei', description: 'A traveler.' },
      prompt: {
        ...chat.prompt,
        items: chat.prompt.items.map((item) =>
          item.id === 'personaDescription' ? { ...item, enabled: true } : item,
        ),
      },
    };
    const messages = sentMessages(withPersona);
    expect(messages.slice(0, 2).map((message) => message.content)).toEqual([
      'A traveler.',
      'Knight of Kei.',
    ]);
  });
});

describe('会話の写しを直す', () => {
  it('写しだけが変わり、送る中身にも効く。プリセットは変わらない', async () => {
    await openCardFile(cardFile('Aria', { description: 'Old.' }));
    const chatId = Object.keys(useChatStore.getState().chats)[0]!;
    editCharacter(chatId, { description: 'New.', name: 'ユキ' });
    const chat = useChatStore.getState().chats[chatId]!;
    expect(sentMessages(chat)[0]?.content).toBe('New.');
    expect(chat.character?.name).toBe('ユキ');
    const preset = Object.values(usePresetsStore.getState().presets)[0]!;
    expect(preset.fields.description).toBe('Old.');
    expect(preset.name).toBe('Aria');
  });
});

describe('プリセットを作る・上書きする・消す', () => {
  it('同じ名前でも毎回新しく作る', () => {
    const image = 'a1';
    const first = usePresetsStore.getState().add('新しいプリセット', EMPTY_CHARACTER, image, []);
    const second = usePresetsStore.getState().add('新しいプリセット', EMPTY_CHARACTER, image, []);
    expect(first.id).not.toBe(second.id);
    expect(first.imageId).toBe(image);
  });

  it('上書きは名前と欄を替え、消すと一覧から消える', () => {
    const preset = usePresetsStore.getState().add('A', EMPTY_CHARACTER, null, []);
    usePresetsStore
      .getState()
      .update(
        preset.id,
        'B',
        { ...EMPTY_CHARACTER, name: 'ミナ' },
        { imageId: null, lorebooks: [] },
      );
    expect(usePresetsStore.getState().presets[preset.id]).toMatchObject({
      name: 'B',
      fields: { name: 'ミナ' },
    });
    usePresetsStore.getState().remove(preset.id);
    expect(usePresetsStore.getState().presets[preset.id]).toBeUndefined();
  });
});
describe('プリセットを写す', () => {
  const lorebook = [{ id: 'b1', name: 'Book', entries: [loreEntry({ content: 'Lore.' })] }];

  it('プリセットを選ぶと辞書の中身と画像の id を会話に写し、以後はプリセットを消しても残る', () => {
    const preset = usePresetsStore
      .getState()
      .add('P', { ...EMPTY_CHARACTER, name: 'P' }, 'a1', lorebook);
    const chatId = useChatStore.getState().add();
    linkPreset(chatId, preset.id);
    expect(useChatStore.getState().chats[chatId]).toMatchObject({
      lorebooks: lorebook,
      imageId: 'a1',
    });
    usePresetsStore.getState().remove(preset.id);
    const chat = useChatStore.getState().chats[chatId];
    expect(chat === undefined ? null : [chatLorebooks(chat), chatImageId(chat)]).toEqual([
      lorebook,
      'a1',
    ]);
  });

  it('会話で辞書を直してもプリセットは変わらない', () => {
    const preset = usePresetsStore.getState().add('P', EMPTY_CHARACTER, null, lorebook);
    const chatId = useChatStore.getState().add();
    linkPreset(chatId, preset.id);
    useChatStore.getState().update(chatId, { lorebooks: [] });
    expect(usePresetsStore.getState().presets[preset.id]?.lorebooks).toEqual(lorebook);
  });

  it('同じカードを読み込み直しても、プリセットと追加辞書の表は増えない', async () => {
    const book = { name: 'B', entries: [{ keys: ['k'], content: 'Lore.' }] };
    await openCardFile(cardFile('Aria', { character_book: book }));
    await openCardFile(cardFile('Aria', { character_book: book }));
    expect(Object.keys(usePresetsStore.getState().presets)).toHaveLength(1);
    expect(useDictionariesStore.getState().dictionaries).toEqual({});
  });
});
