import { describe, expect, it } from 'vitest';

import { cardComposition, EMPTY_CHARACTER } from '@/chat/card';
import {
  ADVISOR_USES,
  applyProposal,
  type AdvisorProposal,
  type AdvisorTarget,
} from '@/chat/prompt-advisor';
import { parseProposal, splitAdvisorText } from '@/chat/prompt-advisor-parse';
import { advisorContextText, advisorGreeting, advisorMessages } from '@/chat/prompt-advisor-text';

import { chat, chatMessage, contentText, sampleComposition } from '../helpers/llm';

const fence = (body: string): string => '```kisara-prompt\n' + body + '\n```';

const proposal = (changes: readonly unknown[]): string =>
  fence(JSON.stringify({ title: 'T', changes }));

const target = (patch: Partial<AdvisorTarget> = {}): AdvisorTarget => ({
  prompt: sampleComposition(),
  character: null,
  lorebooks: [],
  ...patch,
});

const apply = (changes: AdvisorProposal['changes'], base: AdvisorTarget = target()) => {
  let next = 0;
  return applyProposal(
    base,
    { title: '', changes },
    { newId: () => `new-${String((next += 1))}`, lorebookName: 'Book' },
  );
};

describe('案の読み方', () => {
  it('本文を文と案に分け、読めない案と閉じていない案を見分ける', () => {
    const text = [
      'Intro',
      proposal([{ target: 'main', content: 'S' }]),
      'Middle',
      fence('{ broken'),
      'Tail',
      '```kisara-prompt\n{"title"',
    ].join('\n');
    expect(splitAdvisorText(text).map((segment) => segment.kind)).toEqual([
      'text',
      'proposal',
      'text',
      'invalid',
      'text',
      'pending',
    ]);
  });

  it('コードブロックに文字で書いた呼び出し（名前({...})）は、括弧の中を案として読む', () => {
    const body = JSON.stringify({ title: 'T', changes: [{ target: 'main', content: 'S' }] });
    const text = fence(`propose_prompt_changes(${body})`);
    expect(splitAdvisorText(text).map((segment) => segment.kind)).toEqual(['proposal']);
  });

  it('読めない変える所は落とし、1 件も無ければ案にしない', () => {
    const read = parseProposal(
      JSON.stringify({
        changes: [
          { target: 'character', field: 'unknown', content: 'x' },
          { target: 'item', content: 'no id' },
          { target: 'systemPrompt', content: 'not editable' },
          { target: 'dictionaryEntry', keywords: [], content: 'never matched' },
          { target: 'prefill', content: 'P' },
        ],
      }),
    );
    expect(read).toEqual({ title: '', changes: [{ target: 'prefill', content: 'P' }] });
    expect(
      parseProposal(JSON.stringify({ changes: [{ target: 'nope', content: '' }] })),
    ).toBeNull();
  });
});

describe('案の当て方', () => {
  it('項目の本文を直し、印の項目と無い項目は飛ばす', () => {
    const { next, applied } = apply([
      { target: 'item', id: 'rules', content: 'R' },
      { target: 'item', id: 'chatHistory', content: 'x' },
      { target: 'item', id: 'missing', content: 'x' },
    ]);
    expect(applied).toBe(1);
    expect(next.prompt.items.find((item) => item.id === 'rules')?.content).toBe('R');
  });

  it('メインプロンプトが無ければ構成の先頭に足し、あれば本文を書いて有効にする', () => {
    const added = apply([{ target: 'main', content: 'M' }]).next.prompt;
    expect(added.items[0]).toMatchObject({ id: 'main', content: 'M', enabled: true });
    const disabled = {
      ...added,
      items: added.items.map((item) => (item.id === 'main' ? { ...item, enabled: false } : item)),
    };
    const written = apply([{ target: 'main', content: 'M2' }], target({ prompt: disabled }));
    expect(written.next.prompt.items.filter((item) => item.id === 'main')).toMatchObject([
      { content: 'M2', enabled: true },
    ]);
  });

  it('要らない項目を消し、会話履歴・メッセージ・追加辞書の印は消さない', () => {
    const { next, applied } = apply([
      { target: 'removeItem', id: 'tone' },
      { target: 'removeItem', id: 'chatHistory' },
      { target: 'removeItem', id: 'additionalInfo' },
    ]);
    expect(applied).toBe(1);
    const ids = next.prompt.items.map((item) => item.id);
    expect(ids).not.toContain('tone');
    expect(ids).toContain('chatHistory');
  });

  it('個別追加辞書が無ければ作って項目を足し、名前が無ければ先頭の辞書に足して切っていれば使うにする', () => {
    const lore = {
      target: 'dictionaryEntry',
      dictionary: '',
      keys: ['castle'],
      content: 'C',
      constant: false,
      comment: '',
      enabled: true,
    } as const;
    const created = apply([lore]).next.lorebooks ?? [];
    expect(created.map((book) => book.name)).toEqual(['Book']);
    expect(created[0]?.entries.map((entry) => entry.keys)).toEqual([['castle']]);
    const off = created.map((book) => ({ ...book, off: true as const }));
    const appended = apply([lore], target({ lorebooks: off })).next.lorebooks ?? [];
    expect(appended).toHaveLength(1);
    expect(appended[0]?.entries).toHaveLength(2);
    expect(appended[0]?.off).toBeUndefined();
  });

  it('足す先は LLM が書いた名前の辞書。無い名前なら、その名前で 1 冊足す', () => {
    const entry = (dictionary: string) =>
      ({
        target: 'dictionaryEntry',
        dictionary,
        keys: ['k'],
        content: 'C',
        constant: false,
        comment: '',
        enabled: true,
      }) as const;
    const books = [
      { id: 'b1', name: 'Card', entries: [] },
      { id: 'b2', name: 'Places', entries: [] },
    ];
    const into = apply([entry('Places')], target({ lorebooks: books })).next.lorebooks ?? [];
    expect(into.map((book) => book.entries.length)).toEqual([0, 1]);
    const added = apply([entry('Items')], target({ lorebooks: books })).next.lorebooks ?? [];
    expect(added.map((book) => book.name)).toEqual(['Card', 'Places', 'Items']);
    expect(added[2]?.entries).toHaveLength(1);
  });

  it('段を書かせる辞書の項目は、作業の用途でも切って足す', () => {
    const step = {
      target: 'dictionaryEntry',
      dictionary: 'Outline',
      keys: [],
      content: 'Step 1',
      constant: true,
      comment: 'One',
      enabled: false,
    } as const;
    const options = { newId: () => 'b1', lorebookName: 'Book', use: 'work' as const };
    const proposal = { title: '', changes: [step] };
    expect(applyProposal(target(), proposal, options).applied).toBe(0);
    const { next } = applyProposal(target(), proposal, { ...options, outline: 'Outline' });
    expect(next.lorebooks?.[0]?.name).toBe('Outline');
    expect(next.lorebooks?.[0]?.entries[0]?.enabled).toBe(false);
    expect(next.lorebooks?.[0]?.entries[0]?.depth).toEqual({ depth: 0, role: 'system' });
  });

  it('プレイブックから開いた相談は、現在の状況の欄を当てない', () => {
    const situation = {
      target: 'character',
      field: 'scenario',
      content: 'At dawn.',
    } as const;
    const proposal = { title: '', changes: [situation] };
    const options = { newId: () => 'b1', lorebookName: 'Book', use: 'story' as const };
    expect(applyProposal(target(), proposal, options).applied).toBe(1);
    const kept = applyProposal(target(), proposal, { ...options, keepSituation: true });
    expect(kept.applied).toBe(0);
  });

  it('新しい項目を履歴の前と後の段の最後に足す', () => {
    const { next } = apply([
      { target: 'newItem', name: 'Before', place: 'before', content: 'B' },
      { target: 'newItem', name: 'After', place: 'after', content: 'A' },
    ]);
    const ids = next.prompt.items.map((item) => item.id);
    expect(ids.indexOf('new-1')).toBe(ids.indexOf('chatHistory') - 1);
    expect(ids.at(-1)).toBe('new-2');
    expect(next.prompt.items.find((item) => item.id === 'new-2')).toMatchObject({
      name: 'After',
      content: 'A',
    });
  });

  it('カードの欄を書き、中身の入った欄の印を足して有効にする', () => {
    const { next } = apply([
      { target: 'character', field: 'description', content: 'D' },
      { target: 'character', field: 'name', content: 'Kisara' },
      { target: 'prefill', content: '{{char}}:' },
    ]);
    expect(next.character).toMatchObject({ name: 'Kisara', description: 'D' });
    expect(next.prompt.prefill).toEqual({ content: '{{char}}:', enabled: true });
    const markers = next.prompt.items.filter((item) => item.marker !== null);
    expect(markers.find((item) => item.marker === 'charDescription')?.enabled).toBe(true);
    expect(markers.find((item) => item.marker === 'charPersonality')?.enabled).toBe(true);
  });
});

describe('物語の共作の勘所', () => {
  it('{{user}} を物語の主人公として書かせ、{{user}} との対話として書かせない', () => {
    const text = advisorContextText(chat([]), 'story');
    expect(text).toContain('{{user}} is the protagonist of the story');
    expect(text).toContain('never as a dialogue with {{user}}');
  });
});

describe('相談で送る messages', () => {
  it('システムプロンプト、付加情報を埋め込んだ初期メッセージ、発言の順に送り、空の発言は送らない', () => {
    const base = chat([chatMessage('u1', 'user', ['hi'])]);
    const greeting = advisorGreeting('Hello', advisorContextText(base, 'roleplay'));
    const sent = advisorMessages(
      'SYS',
      [
        { id: 'a', role: 'user', content: 'Help' },
        { id: 'b', role: 'assistant', content: '' },
      ],
      { greeting },
    );
    expect(sent.map((message) => message.role)).toEqual(['system', 'assistant', 'user']);
    expect(sent[0]?.content).toBe('SYS');
    const first = sent[1] === undefined ? '' : contentText(sent[1]);
    expect(first.startsWith('Hello\n\n```kisara-context\n')).toBe(true);
    expect(first).toContain('propose_prompt_changes');
    expect(first).not.toContain('kisara-prompt');
    expect(first.split('Current composition (JSON):')[1]).not.toContain('"prefill"');
    expect(first).not.toContain('"hi"');
  });

  it('付加情報を用途で絞り、作業ではカードの欄と個別追加辞書を渡さない', () => {
    const base = chat([], { character: { ...EMPTY_CHARACTER, description: 'D' } });
    const work = advisorContextText(base, 'work');
    const roleplay = advisorContextText(base, 'roleplay');
    for (const word of ['"card"', 'dictionaryEntry', 'individualDictionaries']) {
      expect(work).not.toContain(word);
      expect(roleplay).toContain(word);
    }
  });

  it('段を書かせるときは、段の終わりの状態を次の段の始まりにつながる形で書かせる', () => {
    const guide = { use: 'story' as const, visible: '', guide: '', outline: '##playbook' };
    const text = advisorContextText(chat([]), 'story', guide);
    expect(text).toContain('leads into the beginning of the next step');
  });

  it('段は段の辞書にだけ書かせ、構成の項目と、段でない項目をその辞書に書くことを断る', () => {
    const guide = { use: 'story' as const, visible: '', guide: '', outline: '##playbook' };
    const text = advisorContextText(chat([]), 'story', guide);
    expect(text).toContain(
      'outline steps only as dictionary entries of the dictionary "##playbook"',
    );
    expect(text).toContain('Never put outline steps into main, item, newItem');
    expect(text).toContain('put other\nentries (premise, setting');
  });

  it('段は案のブロックで書かせ、文字だけの段・変更は反映できないと伝える', () => {
    const guide = { use: 'story' as const, visible: '', guide: '', outline: '##playbook' };
    const text = advisorContextText(chat([]), 'story', guide);
    expect(text).toContain('An outline written only as text is not applied');
    expect(text).toContain('Changes described only in text are not applied');
    expect(text).toContain('"##playbook" is a dictionary, not a prompt item');
    expect(text).toContain('{"target": "dictionaryEntry", "dictionary": "##playbook"');
  });

  it('プレイブックから開いた相談だけ、今の構成を土台にして作り直させない', () => {
    const guide = { use: 'story' as const, visible: '', guide: 'G', outline: '##playbook' };
    expect(advisorContextText(chat([]), 'story', guide)).toContain('Build on them');
    expect(advisorContextText(chat([]), 'story')).not.toContain('Build on them');
  });

  it('ロールプレイでは、外見の印象・役回り・呼び方・反応と、性格の短所・場面の違う会話例を書かせる', () => {
    const base = chat([]);
    const roleplay = advisorContextText(base, 'roleplay');
    for (const word of ['Appearance:', 'Role:', 'Speech:', 'Reactions:', 'flaws', 'moods']) {
      expect(roleplay).toContain(word);
      expect(advisorContextText(base, 'work')).not.toContain(word);
    }
  });

  it('ロールプレイでは、返答の長さと形を書かせ、最初のメッセージと会話例をその長さにそろえさせる', () => {
    const roleplay = advisorContextText(chat([]), 'roleplay');
    expect(roleplay).toContain('reply length and form');
    expect(roleplay).toContain('Keep firstMessage and dialogueExamples to that same length');
  });

  it('新しく作る相談は用途の勘所を送らず、今の値と案の書き方を送る', () => {
    const blank = advisorContextText(chat([]), 'blank');
    expect(blank).not.toMatch(/^Use:/mu);
    expect(blank).toContain('Current composition (JSON):');
    expect(blank).toContain('dictionaryEntry');
    expect(ADVISOR_USES).toEqual(['blank', 'work', 'story', 'roleplay', 'game']);
  });

  it('中身にバッククォートの並びがあっても、それより長い囲みで埋め込む', () => {
    expect(advisorGreeting('Hi', 'a ```` b')).toContain('`````kisara-context');
  });
});

describe('用途での絞り込み', () => {
  it('作業の相談の案では、カードの欄と個別追加辞書を変えない', () => {
    const { applied } = applyProposal(
      target(),
      {
        title: '',
        changes: [
          { target: 'character', field: 'name', content: 'K' },
          { target: 'item', id: 'rules', content: 'R' },
        ],
      },
      { newId: () => 'n', lorebookName: 'B', use: 'work' },
    );
    expect(applied).toBe(1);
  });
});

describe('送る名前', () => {
  it('送る文に SillyTavern を類推させる語を出さない', () => {
    const fields = {
      ...EMPTY_CHARACTER,
      name: 'K',
      mesExample: 'ex',
      firstMes: 'hi',
      postHistoryInstructions: 'P',
    };
    const prompt = cardComposition({ ...fields, lorebook: [] });
    const lorebooks = [{ id: 'b1', name: 'B', entries: [] }];
    const sent = advisorMessages(
      '',
      [],
      {
        greeting: advisorGreeting(
          '',
          advisorContextText(chat([], { prompt, character: fields, lorebooks }), 'roleplay'),
        ),
      },
    )
      .map((message) => contentText(message))
      .join('\n');
    const words = [/lorebook/iu, /\bmesExample\b/u, /\bfirstMes\b/u, /<START>/u, /jailbreak/iu];
    for (const word of [...words, /persona(?!lity)/iu]) expect(sent).not.toMatch(word);
    expect(sent).toContain('"afterHistoryInstruction"');
  });

  it('送った名前で書かれた案を、構成の id とカードの欄に戻して読む', () => {
    const read = parseProposal(
      JSON.stringify({
        changes: [
          { target: 'item', id: 'afterHistoryInstruction', content: 'P' },
          { target: 'removeItem', id: 'currentSituation' },
          { target: 'card', field: 'firstMessage', content: 'Hello' },
          { target: 'dictionaryEntry', keywords: ['castle'], content: 'C' },
          { target: 'dictionaryEntry', dictionary: ' Places ', keywords: ['sea'], content: 'S' },
        ],
      }),
    );
    expect(read?.changes).toEqual([
      { target: 'item', id: 'jailbreak', content: 'P' },
      { target: 'removeItem', id: 'scenario' },
      { target: 'character', field: 'firstMes', content: 'Hello' },
      {
        target: 'dictionaryEntry',
        dictionary: '',
        keys: ['castle'],
        content: 'C',
        constant: false,
        comment: '',
        enabled: true,
      },
      {
        target: 'dictionaryEntry',
        dictionary: 'Places',
        keys: ['sea'],
        content: 'S',
        constant: false,
        comment: '',
        enabled: true,
      },
    ]);
  });
});

describe('予約の辞書', () => {
  const entry = (dictionary: string) =>
    ({
      target: 'dictionaryEntry',
      dictionary,
      keys: ['x'],
      content: 'Step',
      constant: true,
      comment: 'One',
      enabled: false,
    }) as const;
  const options = { newId: () => 'b1', lorebookName: 'Book', use: 'story' as const };

  it('## で始まる辞書には、段を書かせる ##playbook のほかは足さない', () => {
    const proposal = { title: '', changes: [entry('##other')] };
    expect(applyProposal(target(), proposal, options).applied).toBe(0);
  });

  it('##playbook に足す段は *, 【段の題】 の常時の項目にする', () => {
    const proposal = { title: '', changes: [entry('##playbook')] };
    const { next } = applyProposal(target(), proposal, { ...options, outline: '##playbook' });
    expect(next.lorebooks?.[0]?.name).toBe('##playbook');
    expect(next.lorebooks?.[0]?.entries[0]).toMatchObject({ keys: ['【One】'], constant: true });
  });

  it('予約の辞書の名前（## で始まる）を構成の項目の名前にした案は足さない', () => {
    const proposal = {
      title: '',
      changes: [
        { target: 'newItem', name: '##playbook', place: 'before', content: 'Outline' },
        { target: 'newItem', name: 'Style', place: 'before', content: 'Plain' },
      ] as const,
    };
    const { next, applied } = applyProposal(target(), proposal, options);
    expect(applied).toBe(1);
    expect(next.prompt.items.map((item) => item.name)).not.toContain('##playbook');
  });
});
