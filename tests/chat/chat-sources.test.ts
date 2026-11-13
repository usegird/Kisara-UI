import { describe, expect, it } from 'vitest';

import {
  changesLorePreview,
  characterOf,
  chatImageId,
  chatLorebooks,
  loreMessages,
  loreSourcesOf,
  type LoreLibrary,
} from '@/chat/chat-sources';
import type { Dictionary } from '@/chat/dictionary';
import type { OwnLorebook } from '@/chat/lore';

import { chat, chatMessage, loreEntry } from '../helpers/llm';

// ─────────────────────────────
// 会話から読む送る中身の出どころ（写しの欄・個別追加辞書・当てるロア・打ちかけ）
// ─────────────────────────────

const DICTIONARY: Dictionary = {
  id: 'd1',
  name: 'D',
  entries: [loreEntry({ content: 'global' })],
  createdAt: 0,
  updatedAt: 0,
};

const BOOK: OwnLorebook = { id: 'b1', name: 'B', entries: [loreEntry({ content: 'own' })] };

const LIBRARY: LoreLibrary = { dictionaries: { d1: DICTIONARY }, enabledIds: ['d1', 'gone'] };

describe('会話の欄の読み出し', () => {
  it('無い欄は null か空', () => {
    const empty = chat();
    expect([characterOf(empty), chatLorebooks(empty), chatImageId(empty)]).toEqual([
      null,
      [],
      null,
    ]);
  });

  it('ある欄はそのまま返す', () => {
    const withBook = chat([], { lorebooks: [BOOK], imageId: 'a1' });
    expect([chatLorebooks(withBook).length, chatImageId(withBook)]).toEqual([1, 'a1']);
  });
});

describe('loreSourcesOf', () => {
  it('全体で有効にした辞書が先、個別追加辞書が後。一覧に無い辞書は当てない', () => {
    const sources = loreSourcesOf(chat([], { lorebooks: [BOOK] }), LIBRARY);
    expect(sources.map((source) => source.entries[0]?.content)).toEqual(['global', 'own']);
    expect(sources[1]?.budgetFirst).toBe(true);
  });

  it('会話で切った辞書と空の辞書は当てない', () => {
    const books: OwnLorebook[] = [
      { ...BOOK, off: true },
      { ...BOOK, id: 'b2', entries: [] },
    ];
    expect(loreSourcesOf(chat([], { lorebooks: books }), LIBRARY)).toHaveLength(1);
  });

  it('動的追加辞書を切っていれば何も当てない', () => {
    expect(loreSourcesOf(chat([], { lorebooks: [BOOK] }), { ...LIBRARY, on: false })).toEqual([]);
  });
});

describe('loreMessages', () => {
  const history = chat([chatMessage('m1', 'user', ['hi'])]);

  it('打ちかけが無い・空白だけなら会話の発言のまま', () => {
    expect(loreMessages(history, undefined)).toBe(history.messages);
    expect(loreMessages(history, '  ')).toBe(history.messages);
  });

  it('打ちかけを今回のメッセージとして末尾に足す', () => {
    const last = loreMessages(history, 'draft').at(-1);
    expect([last?.role, last?.candidates[0]?.content]).toEqual(['user', 'draft']);
  });
});

describe('changesLorePreview', () => {
  it('行の数が変わったら作り直す', () => {
    expect(changesLorePreview('a', 'a\nb')).toBe(true);
  });

  it('空にしたら作り直す', () => {
    expect(changesLorePreview('abc', ' ')).toBe(true);
  });

  it('同じ行の中で打っているだけなら作り直さない', () => {
    expect(changesLorePreview('ab', 'abc')).toBe(false);
  });
});
