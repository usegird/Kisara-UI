import { describe, expect, it } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { serializeConversations, toConversation } from '@/chat/conversation-file';
import { parseConversations } from '@/chat/conversation-file-parse';
import type { Chat } from '@/chat/types';

import { chat, chatMessage, loreEntry } from '../helpers/llm';

function roundTrip(original: Chat): Chat | undefined {
  const text = serializeConversations([{ id: 'c1', chat: original }]);
  return parseConversations(JSON.parse(text)).chats[0];
}

describe('書き出しと読み戻し', () => {
  it('メッセージ・候補・選んでいる候補・設定・時刻が戻る', () => {
    const original = chat(
      [
        chatMessage('u1', 'user', ['hi']),
        chatMessage('a1', 'assistant', ['A', 'B', 'C'], 1),
        chatMessage('u2', 'user', ['next']),
        chatMessage('a2', 'assistant', ['D']),
      ],
      {
        name: 'n',
        createdAt: 1_000,
        updatedAt: 2_000,
      },
    );
    expect(roundTrip(original)).toEqual(original);
  });

  it('候補は兄弟の節にし、後ろの発言は選んでいる候補の子にする', () => {
    const conversation = toConversation(
      'c1',
      chat([
        chatMessage('u1', 'user', ['hi']),
        chatMessage('a1', 'assistant', ['A', 'B'], 1),
        chatMessage('u2', 'user', ['next']),
      ]),
    );
    const mapping = conversation.mapping as Record<string, { parent: string; children: string[] }>;
    expect(mapping['u1.0']?.children).toEqual(['a1.0', 'a1.1']);
    expect(mapping['u2.0']?.parent).toBe('a1.1');
    expect(mapping['a1.0']?.children).toEqual([]);
    expect(conversation.current_node).toBe('u2.0');
  });

  it('失敗した空の候補も残す', () => {
    const failed = chat([
      chatMessage('u1', 'user', ['hi']),
      {
        id: 'a1',
        role: 'assistant',
        selected: 0,
        candidates: [
          { content: '', reasoning: '', end: { kind: 'failed', failure: { kind: 'auth' } } },
        ],
      },
    ]);
    expect(roundTrip(failed)?.messages[1]?.candidates[0]?.end.kind).toBe('failed');
  });

  it('プリセットの写しの欄も戻る', () => {
    const character = { ...EMPTY_CHARACTER, name: 'ミナ', description: 'd' };
    const original = chat([chatMessage('u1', 'user', ['hi'])], {
      preset: { id: 'p1', name: 'P' },
      character,
    });
    expect(roundTrip(original)?.character).toEqual(character);
  });

  it('API キーとベース URL は書かない', () => {
    const text = serializeConversations([{ id: 'c1', chat: chat() }]);
    expect(text).not.toContain('apiKey');
    expect(text).not.toContain('baseUrl');
  });
});

describe('ChatGPT の書き出し', () => {
  const node = (
    id: string,
    parent: string | null,
    children: string[],
    role: string | null,
    text = '',
    contentType = 'text',
  ): Record<string, unknown> => ({
    id,
    parent,
    children,
    message:
      role === null
        ? null
        : { author: { role }, content: { content_type: contentType, parts: [text] } },
  });

  const exported = [
    {
      title: 'From ChatGPT',
      create_time: 1_700_000_000.5,
      update_time: 1_700_000_100,
      current_node: 'a2',
      mapping: {
        root: node('root', null, ['s'], null),
        s: node('s', 'root', ['u1'], 'system', 'sys'),
        u1: node('u1', 's', ['a1', 'a1b'], 'user', 'hello'),
        a1: node('a1', 'u1', [], 'assistant', 'first'),
        a1b: node('a1b', 'u1', ['t1'], 'assistant', 'second'),
        t1: node('t1', 'a1b', ['a2'], 'tool', 'result'),
        a2: node('a2', 't1', [], 'assistant', 'done'),
      },
    },
  ];

  it('最後に見ていた枝を道にし、assistant の分岐を候補にする。ツールは捨てて数える', () => {
    const parsed = parseConversations(exported);
    const [only] = parsed.chats;
    expect(only?.name).toBe('From ChatGPT');
    expect(only && 'systemPrompt' in only).toBe(false);
    expect(only?.createdAt).toBe(1_700_000_000_500);
    expect(only?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'assistant',
    ]);
    expect(only?.messages[1]?.candidates.map((item) => item.content)).toEqual(['first', 'second']);
    expect(only?.messages[1]?.selected).toBe(1);
    expect(parsed.dropped).toBe(1);
  });

  it('モデルと生成の設定は持ち込まない（全体で持つ）', () => {
    const [only] = parseConversations(exported).chats;
    expect(only !== undefined && 'model' in only).toBe(false);
    expect(only !== undefined && 'params' in only).toBe(false);
  });

  it('発言の取れない会話は外して数える', () => {
    const parsed = parseConversations([{ mapping: { root: node('root', null, [], null) } }, 3]);
    expect(parsed.chats).toEqual([]);
    expect(parsed.skipped).toBe(2);
  });
});

describe('添えた画像', () => {
  it('発言の metadata.kisara.images に写し、読み戻すと戻る。content は text のまま', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const original = chat([
      chatMessage('u1', 'user', ['see'], 0, [png]),
      chatMessage('a1', 'assistant', ['A']),
    ]);
    expect(roundTrip(original)).toEqual(original);
    const conversation = toConversation('c1', original);
    const mapping = conversation.mapping as Record<string, { message: Record<string, unknown> }>;
    const node = mapping['u1.0']?.message;
    expect(node?.content).toEqual({ content_type: 'text', parts: ['see'] });
    expect((node?.metadata as Record<string, unknown>).kisara).toMatchObject({ images: [png] });
  });
});

describe('写した個別追加辞書とアバター', () => {
  it('会話の辞書の並び（切った印を含む）とアバターの id を書いて読み戻す。空の並びも戻り、持たなければ持たない', () => {
    const lorebooks = [
      { id: 'b1', name: 'Book', entries: [loreEntry({ content: 'Lore.' })] },
      { id: 'b2', name: 'Places', entries: [], off: true as const },
    ];
    const copied = chat([chatMessage('u1', 'user', ['hi'])], { lorebooks, imageId: null });
    expect(roundTrip(copied)).toMatchObject({ lorebooks, imageId: null });
    const none = chat([chatMessage('u1', 'user', ['hi'])], { lorebooks: [] });
    expect(roundTrip(none)?.lorebooks).toEqual([]);
    const old = roundTrip(chat([chatMessage('u1', 'user', ['hi'])]));
    expect(old !== undefined && 'lorebooks' in old).toBe(false);
  });
});
