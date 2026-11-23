import { describe, expect, it } from 'vitest';

import { parseCandidate, parseSummary } from '@/chat/candidate-parse';
import { EMPTY_CHARACTER } from '@/chat/card';
import { appendTurn } from '@/chat/edit';
import { parseChat } from '@/chat/file';

import { chat, chatMessage, loreEntry } from '../helpers/llm';

describe('ブラウザの置き場の形', () => {
  it('読み戻すと、メッセージ・候補・選んでいる候補・設定が戻る', () => {
    const original = chat(
      [chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A', 'B'], 1)],
      { name: 'n' },
    );
    expect(parseChat(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('ブラウザの置き場の形から、プリセットの写しの欄も戻る', () => {
    const character = { ...EMPTY_CHARACTER, name: 'ミナ', alternateGreetings: ['やあ'] };
    const restored = parseChat(JSON.parse(JSON.stringify(chat([], { character }))));
    expect(restored?.character).toEqual(character);
  });

  it('受け取り中のまま残った候補は、止めたものとして読む', () => {
    const streaming = appendTurn(chat(), { text: 'q', userId: 'u', assistantId: 'a' });
    const restored = parseChat(JSON.parse(JSON.stringify(streaming)));
    expect(restored?.messages.at(-1)?.candidates[0]?.end).toEqual({ kind: 'stopped' });
  });

  it('候補の無いメッセージは読まない', () => {
    const raw = {
      messages: [
        { id: 'x', role: 'user', candidates: [] },
        { id: 'y', role: 'tool' },
      ],
    };
    expect(parseChat(raw)?.messages).toEqual([]);
  });

  it('選んでいる候補が範囲の外なら、範囲の中へ寄せる', () => {
    const raw = { messages: [{ ...chatMessage('a', 'assistant', ['x', 'y']), selected: 5 }] };
    expect(parseChat(raw)?.messages[0]?.selected).toBe(1);
  });
});

describe('添えた画像', () => {
  it('ブラウザの置き場の形から画像のデータ URL が戻り、画像でないものは読まない', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const original = chat([chatMessage('u1', 'user', ['see'], 0, [png])]);
    expect(parseChat(JSON.parse(JSON.stringify(original)))).toEqual(original);
    const mixed = {
      ...original,
      messages: [chatMessage('u1', 'user', ['see'], 0, [png, 'https://example.test/a.png'])],
    };
    expect(parseChat(mixed)?.messages[0]?.candidates[0]?.images).toEqual([png]);
  });
});

describe('写した個別追加辞書とアバター', () => {
  it('ブラウザの置き場の形から辞書の並びとアバターの id が戻る', () => {
    const lorebooks = [
      { id: 'b1', name: 'Book', entries: [loreEntry({ content: 'Lore.' })] },
      { id: 'b2', name: 'Places', entries: [], off: true as const },
    ];
    const copied = chat([chatMessage('u1', 'user', ['hi'])], { lorebooks, imageId: 'a1' });
    expect(parseChat(JSON.parse(JSON.stringify(copied)))).toMatchObject({
      lorebooks,
      imageId: 'a1',
    });
  });
});

describe('指示で作り直した候補', () => {
  it('土台と指示を読み戻し、指示が空のものは捨てる', () => {
    const revised = (revision: unknown) =>
      parseCandidate({ content: 'A', reasoning: '', end: { kind: 'done' }, revision })?.revision;
    expect(revised({ base: 1, instruction: 'Shorter.' })).toEqual({
      base: 1,
      instruction: 'Shorter.',
    });
    expect(revised({ base: 1, instruction: ' ' })).toBeUndefined();
    expect(revised({ base: -1, instruction: 'x' })).toBeUndefined();
  });
});

describe('要約の読み戻し', () => {
  it('作った応答の記録を読み戻し、数でない項目は落とす', () => {
    const read = parseSummary({
      content: 'S',
      upTo: 'm3',
      response: { usage: { prompt: 300, completion: 20 }, timing: { firstMs: 'x' } },
    });
    expect('summary' in read && read.summary.response).toEqual({
      usage: { prompt: 300, completion: 20 },
    });
    const cached = parseSummary({
      content: 'S',
      upTo: 'm3',
      response: { usage: { prompt: 300, completion: 20, cacheRead: 250, cacheWrite: 'x' } },
    });
    expect('summary' in cached && cached.summary.response?.usage).toEqual({
      prompt: 300,
      completion: 20,
      cacheRead: 250,
    });
    const old = parseSummary({ content: 'S', upTo: 'm3' });
    expect('summary' in old && old.summary.response).toBeUndefined();
  });
});

describe('決めた表情', () => {
  it('ラベルと決めたときの発言を読み、読めないものは持たない', () => {
    const base = { messages: [] };
    expect(parseChat({ ...base, expression: { label: ' joy ', after: 'm1' } })?.expression).toEqual(
      {
        label: 'joy',
        after: 'm1',
      },
    );
    expect(parseChat({ ...base, expression: { label: 'joy' } })?.expression).toEqual({
      label: 'joy',
      after: null,
    });
    expect(parseChat({ ...base, expression: { label: '' } })?.expression).toBeUndefined();
    expect(parseChat({ ...base, expression: 'joy' })?.expression).toBeUndefined();
  });
});
