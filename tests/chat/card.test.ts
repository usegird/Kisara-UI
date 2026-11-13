import { describe, expect, it } from 'vitest';

import { assembleParts, mergeParts } from '@/chat/assemble';
import {
  cardComposition,
  cardFields,
  cardLorebook,
  EMPTY_CHARACTER,
  parseCharacterFields,
  presetSources,
} from '@/chat/card';
import { greetingMessage, syncedGreeting } from '@/chat/card-greeting';
import { readCard } from '@/chat/card-read';
import { appendTurn } from '@/chat/edit';
import { chatLore, withLore } from '@/chat/lore';
import {
  addPromptItem,
  removePromptItem,
  updatePromptItem,
  withSourceMarkers,
} from '@/chat/prompt';
import { type ChatMessage, type PromptComposition } from '@/chat/types';

import { cardView, chat, chatMessage, contentText, sampleComposition } from '../helpers/llm';
import { png, textChunk } from '../helpers/png';

// ─────────────────────────────
// キャラクターカードの読み取りと、送る中身への差し込み。
// ─────────────────────────────

const encoder = new TextEncoder();

function base64Json(value: unknown): string {
  const bytes = encoder.encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes));
}

function v2(data: Record<string, unknown>): Record<string, unknown> {
  return { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Aria', ...data } };
}

describe('カードの読み取り', () => {
  it('PNG は ccv3 を優先し、同じキーワードが複数あれば最初のものを使う', () => {
    const first = v2({ description: 'first' });
    const second = v2({ description: 'second' });
    const both = png(textChunk('chara', base64Json(first)), textChunk('chara', base64Json(second)));
    expect(cardView(readCard(both)!.card).description).toBe('first');

    const v3 = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { name: 'V3', nickname: 'Nick' },
    };
    const withV3 = png(textChunk('chara', base64Json(first)), textChunk('CCV3', base64Json(v3)));
    expect(cardView(readCard(withV3)!.card).name).toBe('Nick');
  });

  it('V1 の JSON は V2 の形にそろえ、カードでない JSON と PNG は null', () => {
    const v1 = { name: 'Old', description: 'd', first_mes: 'Hi' };
    const read = readCard(encoder.encode(JSON.stringify(v1)).buffer);
    expect(read?.card).toMatchObject({ spec: 'chara_card_v2', data: { name: 'Old' } });
    expect(read?.png).toBe(false);
    expect(readCard(encoder.encode('{"nodes":[],"links":[]}').buffer)).toBeNull();
    expect(readCard(png(textChunk('workflow', '{}')))).toBeNull();
  });

  it('日本語の本文も UTF-8 として読む', () => {
    const card = png(textChunk('chara', base64Json(v2({ description: '王都の騎士' }))));
    expect(cardView(readCard(card)!.card).description).toBe('王都の騎士');
  });
});

describe('作者コメント', () => {
  it('`creator_notes` を作者コメントとして持つ（送らない）', () => {
    expect(cardFields(v2({ creator_notes: 'Made by me.' })).creatorNotes).toBe('Made by me.');
    expect(cardFields(v2({})).creatorNotes).toBe('');
  });
});

describe('最初の発言', () => {
  it('first_mes と別の挨拶を候補にし、{{char}}・{{user}} を置き換える', () => {
    const view = cardView(
      v2({ first_mes: 'Hello {{user}}, I am {{char}}.', alternate_greetings: ['Yo', ' '] }),
    );
    const message = greetingMessage(view, 'g1');
    expect(message?.candidates.map((candidate) => candidate.content)).toEqual([
      'Hello User, I am Aria.',
      'Yo',
    ]);
    expect(greetingMessage(cardView(v2({})), 'g2')).toBeNull();
  });
});

describe('始めていない会話の最初の発言', () => {
  const fields = (firstMes: string, alternateGreetings: string[] = []) => ({
    ...EMPTY_CHARACTER,
    name: 'Aria',
    firstMes,
    alternateGreetings,
  });
  const source = (character: ReturnType<typeof fields> | null, messages: ChatMessage[] = []) => ({
    character,
    persona: null,
    messages,
  });
  const contents = (messages: readonly ChatMessage[]) =>
    messages.map((message) => message.candidates.map((candidate) => candidate.content));

  it('発言が無ければ、欄の最初の発言を置く', () => {
    const next = syncedGreeting(source(null), source(fields('Hi {{user}}')), () => 'g');
    expect(contents(next)).toEqual([['Hi User']]);
    expect(next[0]?.id).toBe('g');
  });

  it('写した最初の発言だけなら、欄に合わせて写し直し、全部空にすると外す', () => {
    const before = fields('Hi', ['Yo']);
    const written = [chatMessage('g', 'assistant', ['Hi', 'Yo'], 1)];
    const next = syncedGreeting(
      source(before, written),
      source(fields('Hello', ['Yo']), written),
      () => 'x',
    );
    expect(contents(next)).toEqual([['Hello', 'Yo']]);
    expect(next[0]?.id).toBe('g');
    expect(next[0]?.selected).toBe(1);
    expect(syncedGreeting(source(before, written), source(fields(''), written), () => 'x')).toEqual(
      [],
    );
  });

  it('始めた会話と、最初の発言を直した会話は変えない', () => {
    const before = fields('Hi');
    const started = [chatMessage('g', 'assistant', ['Hi']), chatMessage('u', 'user', ['Hey'])];
    expect(syncedGreeting(source(before, started), source(fields('New'), started), () => 'x')).toBe(
      started,
    );
    const edited = [chatMessage('g', 'assistant', ['Edited'])];
    expect(syncedGreeting(source(before, edited), source(fields('New'), edited), () => 'x')).toBe(
      edited,
    );
  });
});

describe('送る中身への差し込み', () => {
  const card = v2({
    description: 'A knight.',
    scenario: 'In a castle.',
    system_prompt: 'Card system. {{original}}',
    post_history_instructions: '',
  });
  const view = cardView(card);
  const base = (prompt: PromptComposition) =>
    appendTurn(
      chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['hello'])], {
        prompt,
      }),
      { text: 'Q', userId: 'u2', assistantId: 'a2' },
    );

  /**
   * カードの構成の main と jailbreak に、構成の側の本文を入れたもの。欄が空のカードには jailbreak を
   * 置かないので、利用者が足した項目として足す
   */
  const ownText = (main: string, post: string): PromptComposition => {
    const card = cardComposition(view);
    const withMain = updatePromptItem(card, 'main', { content: main, enabled: true }) ?? card;
    const withPost = withMain.items.some((item) => item.id === 'jailbreak')
      ? withMain
      : addPromptItem(withMain, 'jailbreak', 'after');
    return updatePromptItem(withPost, 'jailbreak', { content: post, enabled: true }) ?? withPost;
  };
  it('毎回同じ印は追加辞書の印の直前に、状況は直後に足す', () => {
    const prompt = withSourceMarkers(sampleComposition());
    const ids = prompt.items.map((item) => item.id);
    const anchor = ids.indexOf('additionalInfo');
    expect(ids.slice(anchor - 4, anchor + 2)).toEqual([
      'personaDescription',
      'charDescription',
      'charPersonality',
      'dialogueExamples',
      'additionalInfo',
      'scenario',
    ]);
  });

  it('追加辞書の印が無ければ、どれも main の直後に足す', () => {
    const base = { ...sampleComposition(), items: [] };
    const main = { ...sampleComposition().items[0]!, id: 'main' };
    const ids = withSourceMarkers({ ...base, items: [main] }).items.map((item) => item.id);
    expect(ids).toEqual([
      'main',
      'personaDescription',
      'charDescription',
      'charPersonality',
      'dialogueExamples',
      'scenario',
    ]);
  });

  it('カードから作る構成は、毎回同じ項目の後ろに追加辞書の印と状況を置く', () => {
    const ids = cardComposition(cardView(v2({}))).items.map((item) => item.id);
    const at = ids.indexOf('dialogueExamples');
    expect(ids.slice(at, at + 3)).toEqual(['dialogueExamples', 'additionalInfo', 'scenario']);
  });
  it('メインプロンプトと履歴後の指示は、欄に中身があるときだけ普通の項目として置く', () => {
    const empty = cardComposition(cardView(v2({}))).items.map((item) => item.id);
    expect(empty).not.toContain('main');
    expect(empty).not.toContain('jailbreak');
    const filled = cardComposition(
      cardView(v2({ system_prompt: 'S', post_history_instructions: 'P' })),
    );
    expect(filled.items[0]?.id).toBe('main');
    expect(filled.items.at(-1)?.id).toBe('jailbreak');
    // 無効にでき、消せる
    expect(updatePromptItem(filled, 'jailbreak', { enabled: false })).not.toBeNull();
    expect(removePromptItem(filled, 'jailbreak')).not.toBeNull();
  });

  it('カードの system_prompt は {{original}} に構成の本文を入れて main を置き換える', () => {
    const prompt = ownText('Mine.', '');
    const messages = mergeParts(assembleParts(base(prompt), prompt, presetSources(view, prompt)));
    expect(messages.slice(0, 3)).toEqual([
      { role: 'system', content: 'Card system. Mine.' },
      { role: 'system', content: 'A knight.' },
      { role: 'system', content: 'In a castle.' },
    ]);
  });

  it('置き換えを使わなければ構成の本文のまま。空の post_history_instructions は置き換えない', () => {
    const prompt = ownText('Mine.', 'Rules.');
    const off = { ...prompt, usePresetOverrides: false };
    const messages = mergeParts(assembleParts(base(off), off, presetSources(view, off)));
    expect(contentText(messages[0]!).startsWith('Mine.')).toBe(true);
    const on = mergeParts(assembleParts(base(prompt), prompt, presetSources(view, prompt)));
    expect(contentText(on.at(-1)!).endsWith('Rules.')).toBe(true);
  });
});

describe('ロアブック', () => {
  it('項目を読み、SillyTavern の位置の数値か position で前と後ろに分け、追加辞書の印はいつも有効で置く', () => {
    const view = cardView(
      v2({
        character_book: {
          entries: [
            { keys: ['castle'], content: 'A castle.', enabled: true, position: 'before_char' },
            { keys: ['sea'], content: 'The sea.', constant: true, extensions: { position: 1 } },
          ],
        },
      }),
    );
    expect(view.lorebook.map((entry) => `${entry.side}:${entry.keys.join()}`)).toEqual([
      'before:castle',
      'after:sea',
    ]);
    const enabled = (id: string) =>
      cardComposition(view).items.find((item) => item.id === id)?.enabled;
    expect(enabled('additionalInfo')).toBe(true);
    expect(enabled('worldInfoAfter')).toBeUndefined();
    expect(
      cardComposition(cardView(v2({}))).items.find((item) => item.id === 'additionalInfo')?.enabled,
    ).toBe(true);
  });

  it('中身の無い欄も、カードに無い利用者の情報も有効で置く（空の項目は送らない）', () => {
    const items = cardComposition(cardView(v2({}))).items;
    expect(items.find((item) => item.id === 'personaDescription')?.enabled).toBe(true);
    expect(items.find((item) => item.id === 'charPersonality')?.enabled).toBe(true);
  });

  it('保存した変数を読み、無ければ持たない', () => {
    const raw = { name: 'ミナ', variables: [{ id: 'x', name: '{{place}}', value: '港' }, 1] };
    expect(parseCharacterFields(raw)?.variables).toEqual([
      { id: 'x', name: '{{place}}', value: '港' },
    ]);
    expect(parseCharacterFields({ name: 'ミナ' })?.variables).toBeUndefined();
  });
  it('戻すの印は true のときだけ読む', () => {
    const rows = [
      { id: 'x', name: 'アオバネ', value: '花子', restore: true },
      { id: 'y', name: '{{place}}', value: '港', restore: 'yes' },
    ];
    expect(parseCharacterFields({ name: 'ミナ', variables: rows })?.variables).toEqual([
      { id: 'x', name: 'アオバネ', value: '花子', restore: true },
      { id: 'y', name: '{{place}}', value: '港' },
    ]);
  });

  it('位置 4 は深さと role、selective は第 2 のキー、insertion_order は順として読む', () => {
    const [entry] = cardView(
      v2({
        character_book: {
          entries: [
            {
              keys: ['k'],
              secondary_keys: ['s'],
              selective: true,
              insertion_order: 7,
              content: 'D.',
              extensions: {
                position: 4,
                depth: 3,
                role: 1,
                scan_depth: 5,
                selectiveLogic: 2,
                probability: 40,
              },
            },
          ],
        },
      }),
    ).lorebook;
    expect(entry).toMatchObject({
      depth: { depth: 3, role: 'user' },
      scanDepth: 5,
      secondaryKeys: ['s'],
      logic: 'nor',
      probability: 40,
      order: 7,
      priority: 7,
    });
  });
  it('会話に当たった項目だけを World Info の印に入れて送る', () => {
    const view = cardView(
      v2({
        description: 'A knight.',
        character_book: {
          entries: [
            { keys: ['castle'], content: 'The castle lore.', position: 'before_char' },
            { keys: ['sea'], content: 'The sea lore.', position: 'before_char' },
          ],
        },
      }),
    );
    const prompt = cardComposition(view);
    const talk = chat(
      [chatMessage('u1', 'user', ['To the castle!']), chatMessage('a1', 'assistant', [''])],
      {
        prompt,
      },
    );
    const lore = chatLore(
      [{ id: 'book', entries: view.lorebook }],
      prompt,
      { userName: 'User', charName: view.name },
      { messages: talk.messages, context: null },
    );
    const sources = withLore(presetSources(view, prompt), lore);
    const sent = mergeParts(assembleParts(talk, prompt, sources))
      .map(contentText)
      .join('\n');
    expect(sent).toContain('The castle lore.');
    expect(sent).not.toContain('The sea lore.');
  });
});
describe("Character's Note", () => {
  const base = (prompt: PromptComposition) =>
    appendTurn(chat([chatMessage('u1', 'user', ['hi'])], { prompt }), {
      text: 'Q',
      userId: 'u2',
      assistantId: 'a2',
    });
  const noteCard = (role: string) =>
    v2({ extensions: { depth_prompt: { prompt: 'Note.', depth: 0, role } } });

  /** カードの個別追加辞書を当てて送る中身にする */
  function sendCard(card: Record<string, unknown>): ReturnType<typeof mergeParts> {
    const view = cardView(card);
    const prompt = cardComposition(view);
    const talk = base(prompt);
    const book = cardLorebook(card);
    const sources = [{ id: 'book', entries: book?.entries ?? [] }];
    const names = { userName: 'User', charName: view.name };
    const lore = chatLore(sources, prompt, names, { messages: talk.messages, context: null });
    return mergeParts(assembleParts(talk, prompt, withLore(presetSources(view, prompt), lore)));
  }

  it('個別追加辞書の常時の項目にし、欄には持たない', () => {
    const card = v2({
      character_book: { name: 'Book', entries: [{ keys: ['k'], content: 'Lore.' }] },
      extensions: { depth_prompt: { prompt: 'Stay noble.', depth: 3, role: 'user' } },
    });
    const book = cardLorebook(card);
    expect(book?.name).toBe('Book');
    expect(book?.entries.map((entry) => entry.content)).toEqual(['Lore.', 'Stay noble.']);
    expect(book?.entries[1]).toMatchObject({
      constant: true,
      depth: { depth: 3, role: 'user' },
      comment: "Character's Note",
    });
    expect('depthPrompt' in cardFields(card)).toBe(false);
  });

  it("ロアブックの無いカードでも Character's Note があれば辞書を作る", () => {
    const note = { prompt: 'Old note.', depth: 2, role: 'system' };
    expect(cardLorebook(v2({ extensions: { depth_prompt: note } }))?.entries).toHaveLength(1);
    expect(cardLorebook(v2({}))).toBeNull();
  });

  it('user なら深さ 0 でメッセージの後ろに別の user のメッセージとして置く', () => {
    expect(sendCard(noteCard('user')).slice(-2)).toEqual([
      { role: 'user', content: 'Q' },
      { role: 'user', content: 'Note.' },
    ]);
  });

  it('system ならメッセージの後ろに別の system のメッセージとして置く', () => {
    expect(sendCard(noteCard('system')).slice(-2)).toEqual([
      { role: 'user', content: 'Q' },
      { role: 'system', content: 'Note.' },
    ]);
  });
});
