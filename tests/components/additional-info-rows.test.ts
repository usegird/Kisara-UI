import { describe, expect, it } from 'vitest';

import type { Dictionary } from '@/chat/dictionary';
import { appendTurn } from '@/chat/edit';
import { chatLore, withLore } from '@/chat/lore';
import { NO_SOURCES } from '@/chat/macros';
import { buildChatRequest } from '@/chat/request';
import {
  clipWidth,
  loreRows,
  type AdditionalInfoRow,
} from '@/components/llm/prompt/additional-info-rows';

import { chat, chatMessage, contentText, llm, loreEntry } from '../helpers/llm';

// ─────────────────────────────
// プロンプトのタブの追加辞書の一覧
// ─────────────────────────────

function dictionary(id: string, name: string, entries: Dictionary['entries']): Dictionary {
  return { id, name, entries, createdAt: 0, updatedAt: 0 };
}

const text = (row: AdditionalInfoRow): string => {
  switch (row.kind) {
    case 'entry':
      return `${row.dictionary}: ${row.entry.content} (${row.role})`;
    case 'history':
      return `履歴 ${row.count} 件`;
    case 'message':
      return 'メッセージ';
  }
};

describe('追加辞書の一覧', () => {
  const aria = dictionary('aria', 'アリア', [
    loreEntry({ content: '門番', order: 2 }),
    loreEntry({ content: '疲れ', depth: { depth: 2, role: 'system' } }),
    loreEntry({ content: '口調', depth: { depth: 0, role: 'user' } }),
    loreEntry({ content: '当たらない' }),
  ]);
  const slang = dictionary('slang', 'ネットスラング', [loreEntry({ content: 'ぴえん' })]);

  it('印の項目は追加辞書の一覧に、差し込む項目は会話履歴の中に送る順で並べる。プリセットのロアブックは全体の辞書の後', () => {
    const rows = loreRows({
      own: [aria],
      dictionaries: { slang },
      enabledIds: ['slang'],
      hits: new Map([
        ['aria', new Set([0, 1, 2])],
        ['slang', new Set([0])],
      ]),
      historyCount: 6,
    });
    // 当たっていない項目（当たらない）は出さない。末尾から数えた 1 件目は今回のメッセージ
    expect(rows.additional.map(text)).toEqual([
      'ネットスラング: ぴえん (system)',
      'アリア: 門番 (system)',
    ]);
    expect(rows.history.map(text)).toEqual([
      '履歴 4 件',
      'アリア: 疲れ (system)',
      '履歴 1 件',
      'メッセージ',
      'アリア: 口調 (user)',
    ]);
  });

  it('差し込みが無ければ会話履歴は件数の 1 行', () => {
    const rows = loreRows({
      own: [],
      dictionaries: { slang },
      enabledIds: ['slang'],
      hits: new Map([['slang', new Set([0])]]),
      historyCount: 3,
    });
    expect(rows.additional.map(text)).toEqual(['ネットスラング: ぴえん (system)']);
    expect(rows.history.map(text)).toEqual(['履歴 2 件']);
  });
});

describe('会話履歴の中の並びと送る順', () => {
  it('履歴先頭・位置 -2・位置 0 の差し込みを、送る中身と同じ順に並べる', () => {
    const entries = [
      loreEntry({ constant: true, historyStart: true, content: 'START' }),
      loreEntry({ constant: true, depth: { depth: 2, role: 'system' }, content: 'MINUS2' }),
      loreEntry({ constant: true, depth: { depth: 0, role: 'user' }, content: 'ZERO' }),
    ];
    // u2 は今回送るメッセージ（送るときは会話履歴の最後に入っている）
    const messages = [
      chatMessage('u1', 'user', ['U1']),
      chatMessage('a1', 'assistant', ['A1']),
      chatMessage('u2', 'user', ['U2']),
    ];
    const talk = chat(messages);
    const names = { userName: 'U', charName: 'C' };
    const lore = chatLore([{ id: 'd', entries }], talk.prompt, names, { messages, context: null });
    // 送るときと同じく、今回のメッセージと受け取る側を足した会話から組む
    const sending = appendTurn(chat(messages.slice(0, -1)), {
      text: 'U2',
      userId: 'u2',
      assistantId: 'a2',
    });
    const sent = buildChatRequest(sending, llm(), withLore(NO_SOURCES, lore))
      .messages.map(contentText)
      .flatMap((content) =>
        ['START', 'U1', 'MINUS2', 'A1', 'U2', 'ZERO'].filter((label) => content.includes(label)),
      );
    expect(sent).toEqual(['START', 'U1', 'MINUS2', 'A1', 'U2', 'ZERO']);

    const rows = loreRows({
      own: [],
      dictionaries: { d: dictionary('d', '辞書', entries) },
      enabledIds: ['d'],
      hits: lore.hits,
      historyCount: messages.length,
    });
    expect(rows.history.map(text)).toEqual([
      '辞書: START (system)',
      '履歴 1 件',
      '辞書: MINUS2 (system)',
      '履歴 1 件',
      'メッセージ',
      '辞書: ZERO (user)',
    ]);
  });
});

describe('辞書名の幅', () => {
  it('半角 10 文字まで。全角は 2 文字分で、超えた分は「…」', () => {
    expect(clipWidth('slang')).toBe('slang');
    expect(clipWidth('ネットスラング')).toBe('ネットス…');
    expect(clipWidth('abcdefghijk')).toBe('abcdefghi…');
  });
});
