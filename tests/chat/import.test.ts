import { describe, expect, it } from 'vitest';

import { serializeConversations } from '@/chat/conversation-file';
import { readChatFile } from '@/chat/import';

import { chat, chatMessage } from '../helpers/llm';

// ─────────────────────────────
// 会話のファイルの読み込み。形は中身で見分ける。
// ─────────────────────────────

const NOW = 5_000;

describe('形の見分け', () => {
  it('KisaraUI の書き出しを読む', () => {
    const text = serializeConversations([
      { id: 'c', chat: chat([chatMessage('u', 'user', ['hi'])], { name: 'mine' }) },
    ]);
    const parsed = readChatFile(text, 'x.json', NOW);
    expect(parsed?.chats[0]).toMatchObject({ name: 'mine' });
  });

  it('会話 1 つの名前が空ならファイル名にする', () => {
    const text = serializeConversations([
      { id: 'c', chat: chat([chatMessage('u', 'user', ['hi'])], { createdAt: 0 }) },
    ]);
    const parsed = readChatFile(text, 'saved.chat.json', NOW);
    expect(parsed?.chats[0]?.name).toBe('saved');
    expect(parsed?.chats[0]?.createdAt).toBe(NOW);
  });

  it('Claude の書き出しを読む。添付は捨てて数える', () => {
    const text = JSON.stringify([
      {
        uuid: 'x',
        name: 'From Claude',
        created_at: '2026-01-02T03:04:05Z',
        chat_messages: [
          { uuid: 'm1', sender: 'human', text: 'hi', attachments: [{}] },
          { uuid: 'm2', sender: 'assistant', text: '', content: [{ type: 'text', text: 'yo' }] },
        ],
      },
    ]);
    const parsed = readChatFile(text, 'conversations.json', NOW);
    expect(parsed?.chats[0]?.name).toBe('From Claude');
    expect(parsed?.chats[0]?.messages.map((message) => message.candidates[0]?.content)).toEqual([
      'hi',
      'yo',
    ]);
    expect(parsed?.chats[0]?.createdAt).toBe(Date.parse('2026-01-02T03:04:05Z'));
    expect(parsed?.dropped).toBe(1);
  });

  it('SillyTavern の会話を読み、候補と思考の本文を移す', () => {
    const lines = [
      { user_name: 'You', character_name: 'Aria', chat_metadata: {} },
      { name: 'You', is_user: true, mes: 'hello' },
      {
        name: 'Aria',
        is_user: false,
        mes: 'two',
        swipes: ['one', 'two'],
        swipe_id: 1,
        extra: { reasoning: 'think' },
      },
      { name: 'Narrator', is_system: true, mes: 'hidden' },
    ];
    const parsed = readChatFile(
      lines.map((line) => JSON.stringify(line)).join('\n'),
      'a.jsonl',
      NOW,
    );
    const [only] = parsed?.chats ?? [];
    expect(only?.name).toBe('Aria');
    expect(only?.messages).toHaveLength(2);
    expect(only?.messages[1]?.candidates.map((item) => item.content)).toEqual(['one', 'two']);
    expect(only?.messages[1]?.selected).toBe(1);
    expect(only?.messages[1]?.candidates[1]?.reasoning).toBe('think');
  });

  it('読めない形は null', () => {
    expect(readChatFile('{"hello": 1}', 'x.json', NOW)).toBeNull();
    expect(readChatFile('not json', 'x.txt', NOW)).toBeNull();
  });
});
