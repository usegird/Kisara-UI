import { describe, expect, it } from 'vitest';

import { assembleParts, mergeParts } from '@/chat/assemble';
import { EMPTY_CHARACTER } from '@/chat/card';
import { appendTurn, regenerate } from '@/chat/edit';
import {
  applyMacros,
  nameSources,
  NO_SOURCES,
  normalizeVariableName,
  splitComments,
  stripComments,
  type PromptSources,
} from '@/chat/macros';
import { addPromptItem, updatePrefill, updatePromptItem } from '@/chat/prompt';
import { buildChatRequest } from '@/chat/request';
import { applyStreamEvents, finishStream, startWithPrefill } from '@/chat/stream-receive';
import { type PromptComposition } from '@/chat/types';

import { chat, chatMessage, llm, sampleComposition } from '../helpers/llm';

function compose(edits: ((c: PromptComposition) => PromptComposition | null)[]): PromptComposition {
  return edits.reduce((current, edit) => edit(current) ?? current, sampleComposition());
}

const history = [chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['hello'])];

function send(prompt: PromptComposition, text = 'Q', systemPrompt = 'SYS', squash = false) {
  return buildChatRequest(
    appendTurn(chat(history, { prompt }), { text, userId: 'u2', assistantId: 'a2' }),
    llm(),
    {
      ...NO_SOURCES,
      squashSystem: squash,
      systemPrompt,
    },
  ).messages;
}

describe('組み立て', () => {
  it('項目ごとに 1 つのメッセージにする（SillyTavern の既定）', () => {
    const prompt = compose([
      (c) => updatePromptItem(c, 'rules', { content: 'Rules.' }),
      (c) => updatePromptItem(c, 'task', { content: 'Summarize.' }),
      (c) => updatePromptItem(c, 'format', { content: 'Answer in JSON.' }),
    ]);
    const messages = send(prompt);
    expect(messages.slice(0, 2)).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'system', content: 'Rules.' },
    ]);
    expect(messages.slice(-3).map((message) => message.content)).toEqual([
      'Q',
      'Summarize.',
      'Answer in JSON.',
    ]);
  });

  it('まとめる設定では、隣り合う system だけを改行 1 つでつなぐ（user はつながない）', () => {
    const prompt = compose([
      (c) => updatePromptItem(c, 'rules', { content: 'Rules.' }),
      (c) => updatePromptItem(c, 'task', { content: 'Summarize.' }),
    ]);
    const messages = send(prompt, 'Q', 'SYS', true);
    expect(messages[0]).toEqual({ role: 'system', content: 'SYS\nRules.' });
    expect(messages.slice(-2).map((message) => message.content)).toEqual(['Q', 'Summarize.']);
  });

  it('発言に添える指示をメッセージの前へ動かすと、その順で並ぶ', () => {
    const prompt = compose([
      (c) => updatePromptItem(c, 'task', { content: 'Summarize.' }),
      (c) => {
        const task = c.items.find((item) => item.id === 'task');
        const rest = c.items.filter((item) => item !== task);
        const at = rest.findIndex((item) => item.id === 'currentInput');
        return task === undefined ? null : { ...c, items: rest.toSpliced(at, 0, task) };
      },
    ]);
    const messages = send(prompt);
    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'user',
    ]);
    expect(messages.slice(-2).map((message) => message.content)).toEqual(['Summarize.', 'Q']);
  });

  it('会話の履歴の発言どうしはつながない', () => {
    const two = [chatMessage('u0', 'user', ['a']), chatMessage('u1', 'user', ['b'])];
    const request = buildChatRequest(
      appendTurn(chat(two), { text: 'c', userId: 'u2', assistantId: 'a2' }),
      llm(),
    );
    expect(request.messages.map((message) => message.content)).toEqual(['a', 'b', 'c']);
  });

  it('深さ N の項目を履歴の末尾から N 件目の後ろに差し込み、深さ 0 はメッセージの後ろに置く', () => {
    const prompt = compose([
      (c) => addPromptItem(c, 'note'),
      (c) =>
        updatePromptItem(c, 'note', {
          content: 'NOTE',
          position: { kind: 'depth', depth: 1, order: 100 },
        }),
      (c) => addPromptItem(c, 'last'),
      (c) =>
        updatePromptItem(c, 'last', {
          role: 'user',
          content: 'LAST',
          position: { kind: 'depth', depth: 0, order: 100 },
        }),
    ]);
    const contents = send(prompt).map((message) => message.content);
    expect(contents).toEqual(['SYS', 'hi', 'hello', 'NOTE', 'Q', 'LAST']);
  });

  it('履歴より深い N は履歴の先頭に置く', () => {
    const prompt = compose([
      (c) => addPromptItem(c, 'deep'),
      (c) =>
        updatePromptItem(c, 'deep', {
          content: 'DEEP',
          position: { kind: 'depth', depth: 99, order: 100 },
        }),
    ]);
    expect(send(prompt).map((message) => message.content)).toEqual([
      'SYS',
      'DEEP',
      'hi',
      'hello',
      'Q',
    ]);
  });

  it('無効と空の項目は送らない。会話の履歴とメッセージは外せない', () => {
    const prompt = compose([(c) => updatePromptItem(c, 'tone', { enabled: false })]);
    expect(send(prompt, 'Q', '').map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(updatePromptItem(prompt, 'chatHistory', { enabled: false })).toBeNull();
  });

  it('プレフィルを最後に assistant として置く', () => {
    const prompt = compose([(c) => updatePrefill(c, { content: '<response>', enabled: true })]);
    expect(send(prompt).at(-1)).toEqual({ role: 'assistant', content: '<response>' });
  });

  it('{{user}} と {{char}} を大文字小文字を問わず置き換え、無い名前は置き換えない', () => {
    const prompt = compose([]);
    const systemPrompt = 'I am {{char}}, talking to {{USER}}.';
    const base = appendTurn(chat(history, { prompt }), {
      text: 'Q',
      userId: 'u2',
      assistantId: 'a2',
    });
    expect(
      mergeParts(assembleParts(base, prompt, { ...NO_SOURCES, systemPrompt }))[0]?.content,
    ).toBe('I am {{char}}, talking to User.');
    const sources: PromptSources = {
      userName: 'Kei',
      charName: 'Aria',
      markerText: () => '',
      systemPrompt,
    };
    expect(mergeParts(assembleParts(base, prompt, sources))[0]?.content).toBe(
      'I am Aria, talking to Kei.',
    );
  });

  it('印の中身は出どころから引き、空なら置かない', () => {
    const sources: PromptSources = {
      userName: 'User',
      charName: null,
      markerText: (marker) => (marker === 'scenario' ? 'In a cafe.' : ''),
      systemPrompt: 'SYS',
    };
    const base = appendTurn(chat(history), { text: 'Q', userId: 'u2', assistantId: 'a2' });
    const base0 = sampleComposition();
    const scenario = { ...base0.items[0]!, id: 'scenario', marker: 'scenario' as const };
    const composition = { ...base0, items: [scenario, ...base0.items] };
    const parts = assembleParts(base, composition, sources);
    expect(parts.slice(0, 2).map((part) => part.itemId)).toEqual([':system', 'scenario']);
  });
});

describe('プレフィルの受け取り', () => {
  const streaming = appendTurn(chat(history), { text: 'Q', userId: 'u2', assistantId: 'a2' });
  const text = (value: ReturnType<typeof startWithPrefill>): string =>
    value.messages.at(-1)?.candidates[0]?.content ?? '';

  it('ストリーミングの差分はプレフィルの後ろに足す', () => {
    const started = startWithPrefill(streaming, '<r>');
    const next = applyStreamEvents(started, [{ kind: 'delta', content: 'Hi', reasoning: '' }]);
    expect(text(next)).toBe('<r>Hi');
  });

  it('1 つの JSON がプレフィルを含んで返ったら重ねない', () => {
    const started = startWithPrefill(streaming, '<r>');
    const whole = { kind: 'delta', content: '<r>Hi', reasoning: '', whole: true } as const;
    expect(text(applyStreamEvents(started, [whole]))).toBe('<r>Hi');
    const plain = { kind: 'delta', content: 'Hi', reasoning: '', whole: true } as const;
    expect(text(applyStreamEvents(started, [plain]))).toBe('<r>Hi');
  });
});

describe('変数', () => {
  const sources: PromptSources = {
    userName: 'ケイ',
    charName: 'ミナ',
    markerText: () => '',
    variables: [
      { id: 'a', name: '{{place}}', value: '港$&町' },
      { id: 'b', name: '{{user}}', value: '上書きしない' },
      { id: 'c', name: '', value: '空' },
    ],
  };

  it('自分で足した変数を大文字小文字を区別せずに置き換え、{{user}}・{{char}} は名前のまま', () => {
    expect(applyMacros('{{user}}と{{char}}は{{Place}}へ', sources)).toBe('ケイとミナは港$&町へ');
  });

  it('名前は確定したときに {{}} を付ける（付けて打っても二重にしない）', () => {
    expect(normalizeVariableName(' place ')).toBe('{{place}}');
    expect(normalizeVariableName('{{place}}')).toBe('{{place}}');
    expect(normalizeVariableName('{place')).toBe('{{place}}');
    expect(normalizeVariableName(' {{ }} ')).toBe('');
  });
});

describe('戻すの行', () => {
  const sources: PromptSources = {
    userName: 'ケイ',
    charName: 'ミナ',
    markerText: () => '',
    variables: [
      { id: 'a', name: 'アオバネ', value: '山田花子', restore: true },
      { id: 'b', name: '{{place}}', value: '港町' },
    ],
  };

  it('送るときは左の文字を置き換えず、送る文に書いた値は左の文字に替える', () => {
    const sent = applyMacros('アオバネは{{place}}へ。山田花子です', sources);
    expect(sent).toBe('アオバネは港町へ。アオバネです');
    const request = buildChatRequest(
      chat([chatMessage('u1', 'user', ['山田花子と{{char}}'])]),
      llm(),
      sources,
    );
    expect(JSON.stringify(request)).not.toContain('山田花子');
  });

  it('画面に出すときは左の文字を値に戻し、ほかの置き換えも送るときと同じに掛ける', () => {
    expect(applyMacros('アオバネと{{char}}は{{place}}へ', sources, 'show')).toBe(
      '山田花子とミナは港町へ',
    );
  });

  it('戻すの行の左の文字は {{}} を外して打った文字のまま使う', () => {
    expect(normalizeVariableName(' {{アオバネ}} ', true)).toBe('アオバネ');
    expect(normalizeVariableName('アオバネ', true)).toBe('アオバネ');
  });
});

describe('{{user}}・{{char}} の既定と戻す', () => {
  const character = { ...EMPTY_CHARACTER, name: 'ミナ' };

  it('{{char}} の名前が空なら Assistant を送る', () => {
    const names = nameSources({ ...character, name: ' ' }, null);
    expect(applyMacros('{{char}}と{{user}}', names)).toBe('AssistantとUser');
  });

  it('名前を左にした戻すの行は、置き換えた名前にも掛かり、画面では名前に戻す', () => {
    const restore = { id: 'r', name: 'ミケ', value: 'ミナ', restore: true as const };
    const names = nameSources({ ...character, variables: [restore] }, null);
    expect(applyMacros('{{char}}とミナ', names)).toBe('ミケとミケ');
    expect(applyMacros('ミケ', names, 'show')).toBe('ミナ');
  });

  it('戻すの行は上から 1 回ずつ掛け、循環していても止まる', () => {
    const variables = [
      { id: 'a', name: 'B', value: 'A', restore: true as const },
      { id: 'b', name: 'A', value: 'B', restore: true as const },
    ];
    const names = nameSources({ ...character, name: 'A', variables }, null);
    expect(applyMacros('{{char}}', names)).toBe('A');
  });
});

describe('指示で作り直す', () => {
  it('土台の候補と指示を履歴の末尾に置き、受け取り終えた後の送信には入れない', () => {
    const base = chat(history, { prompt: sampleComposition() });
    const redo = regenerate(base, 'Shorter.') ?? base;
    const sent = buildChatRequest(redo, llm(), NO_SOURCES).messages.slice(-2);
    expect(sent).toEqual([
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'Shorter.' },
    ]);
    const received = applyStreamEvents(redo, [{ kind: 'delta', content: 'hi.', reasoning: '' }]);
    const done = finishStream(received, null);
    const next = buildChatRequest(
      appendTurn(done, { text: 'Q', userId: 'u2', assistantId: 'a2' }),
      llm(),
      NO_SOURCES,
    );
    expect(next.messages.map((message) => message.content)).not.toContain('Shorter.');
    expect(next.messages.map((message) => message.content)).not.toContain('hello');
  });
});

describe('送らない注記', () => {
  it('<comment> の間を外す。行まるごとなら行ごと、閉じていなければ残す', () => {
    expect(stripComments('Fix it.\n<comment>Not sent.</comment>')).toBe('Fix it.');
    expect(stripComments('A <comment>x</comment>B\n  <comment>y\nz</comment>\nC')).toBe('A B\nC');
    expect(stripComments('Keep <comment>open')).toBe('Keep <comment>open');
  });

  it('送る発言と指示で作り直すの指示から外し、画面に出す文には残す', () => {
    const base = chat(history, { prompt: sampleComposition() });
    const redo = regenerate(base, 'Shorter.\n<comment>Press regenerate.</comment>') ?? base;
    expect(buildChatRequest(redo, llm(), NO_SOURCES).messages.at(-1)?.content).toBe('Shorter.');
    expect(send(sampleComposition(), 'Q <comment>note</comment>').at(-1)?.content).toBe('Q');
    expect(applyMacros('Q <comment>note</comment>', NO_SOURCES, 'show')).toContain('note');
  });

  it('応答の本文の外の話（注記）は、次に送る履歴から外す', () => {
    const story = [
      chatMessage('u1', 'user', ['Go.']),
      chatMessage('a1', 'assistant', [
        '<comment>Sure.</comment>\nRain fell.\n<comment>Next?</comment>',
      ]),
      chatMessage('u2', 'user', ['More.']),
    ];
    const contents = buildChatRequest(chat(story), llm(), NO_SOURCES).messages.map(
      (message) => message.content,
    );
    expect(contents).toContain('Rain fell.');
    expect(JSON.stringify(contents)).not.toMatch(/Sure|Next\?/u);
  });

  it('本文を注記とそれ以外に分け、受け取り中だけ閉じていない注記も注記にする', () => {
    const kinds = (text: string, open: boolean): string =>
      splitComments(text, open)
        .map((segment) => `${segment.kind}:${segment.text.trim()}`)
        .join('|');
    expect(kinds('<comment> OK </comment>\nBody\n<comment>Next?</comment>', false)).toBe(
      'comment:OK|text:Body|comment:Next?',
    );
    expect(kinds('Body\n<comment>Ide', true)).toBe('text:Body|comment:Ide');
    expect(kinds('Body\n<comment>Ide', false)).toBe('text:Body\n<comment>Ide');
    expect(splitComments('A<comment>x</comment>B', false).map((segment) => segment.start)).toEqual([
      0, 1, 21,
    ]);
  });
});

describe('画像', () => {
  it('画像を持つ発言は本文が先、続けて画像。隣の user とはつながない（まとめる設定でも）', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const parts = [
      { itemId: 'x', role: 'user', content: 'Note.' },
      { itemId: null, role: 'user', content: 'Q', images: [png] },
    ] as const;
    const messages = mergeParts(parts, true);
    expect(messages).toEqual([
      { role: 'user', content: 'Note.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Q' },
          { type: 'image_url', image_url: { url: png } },
        ],
      },
    ]);
    const only = mergeParts([{ itemId: null, role: 'user', content: '', images: [png] }]);
    expect(only[0]?.content).toEqual([{ type: 'image_url', image_url: { url: png } }]);
  });
});
