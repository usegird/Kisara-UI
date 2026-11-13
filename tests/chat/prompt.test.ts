import { describe, expect, it } from 'vitest';

import { cardComposition } from '@/chat/card';
import {
  addPromptItem,
  dropSlots,
  moveToSlot,
  removePromptItem,
  roleOf,
  sectionViews,
  updatePromptItem,
} from '@/chat/prompt';
import { parseComposition } from '@/chat/prompt-parse';
import { estimateChat, estimateText } from '@/chat/tokens';
import { defaultComposition, type PromptComposition } from '@/chat/types';

import { cardView, chat, chatMessage, sampleComposition } from '../helpers/llm';

// ─────────────────────────────
// 構成の操作・読み戻しとトークン数の見積もり。
// ─────────────────────────────

describe('構成の操作', () => {
  it('会話の履歴とメッセージは消せず、深さにも置けない', () => {
    const base = sampleComposition();
    expect(removePromptItem(base, 'chatHistory')).toBeNull();
    const depth = { kind: 'depth', depth: 1, order: 100 } as const;
    expect(updatePromptItem(base, 'currentInput', { position: depth })).toBeNull();
    expect(removePromptItem(base, 'tone')?.items.some((item) => item.id === 'tone')).toBe(false);
  });

  it('メッセージは外せない（読み戻しでも送る）', () => {
    const base = sampleComposition();
    expect(updatePromptItem(base, 'currentInput', { enabled: false })).toBeNull();
    const read = parseComposition({
      items: [{ id: 'currentInput', marker: 'currentInput', role: 'user', enabled: false }],
    });
    expect(read?.items[0]?.enabled).toBe(true);
  });

  it('印の本文は直せない', () => {
    expect(updatePromptItem(sampleComposition(), 'chatHistory', { content: 'x' })).toBeNull();
  });

  it('並べ替えは動かした後の位置に置く', () => {
    const moved = moveToSlot(sampleComposition(), 'format', null, 'tone');
    expect(moved?.items[0]?.id).toBe('format');
  });
});

describe('初めの構成', () => {
  it('印（追加辞書・会話履歴・メッセージ）だけを置き、文面の項目は置かない', () => {
    const items = defaultComposition().items;
    expect(items.map((item) => item.marker)).toEqual([
      'additionalInfo',
      'chatHistory',
      'currentInput',
    ]);
  });
});

describe('読み戻し', () => {
  it('知らない印・同じ id の 2 つ目は外し、印の本文は捨てる', () => {
    const read = parseComposition({
      items: [
        { id: 'a', role: 'user', content: 'x' },
        { id: 'a', role: 'user', content: 'y' },
        { id: 'h', marker: 'chatHistory', content: 'z', position: { kind: 'depth', depth: 2 } },
      ],
    });
    // 追加辞書の印が無い構成には、会話の履歴の手前に足す
    expect(read?.items.map((item) => item.id)).toEqual(['a', 'additionalInfo', 'h']);
    expect(read?.items[2]).toMatchObject({ content: '', position: { kind: 'relative' } });
  });

  it('追加辞書の印は 2 つ目からは外し、無ければ最後に足す', () => {
    const read = parseComposition({
      items: [
        { id: 'rules', role: 'system', content: '' },
        { id: 'examples', role: 'system', content: '' },
        { id: 'x', marker: 'additionalInfo' },
        { id: 'y', marker: 'additionalInfo' },
      ],
    });
    expect(read?.items.map((item) => item.id)).toEqual(['rules', 'examples', 'additionalInfo']);
    const fresh = parseComposition({ items: [{ id: 'rules', role: 'system', content: '' }] });
    expect(fresh?.items.map((item) => item.id)).toEqual(['rules', 'additionalInfo']);
  });
});

describe('追加辞書の印', () => {
  it('消せず、無効にできず、動かせない', () => {
    const base = sampleComposition();
    expect(removePromptItem(base, 'additionalInfo')).toBeNull();
    expect(updatePromptItem(base, 'additionalInfo', { enabled: false })).toBeNull();
    expect(moveToSlot(base, 'additionalInfo', null, 'tone')).toBeNull();
  });
});

describe('ロアの前置き・後置き', () => {
  it('どちらも空なら持たず、読み戻しても同じ', () => {
    const saved = (loreFraming: unknown) =>
      JSON.parse(JSON.stringify({ ...sampleComposition(), loreFraming })) as unknown;
    const wrapped = parseComposition(saved({ prefix: '[Lore]' }));
    expect(wrapped?.loreFraming).toEqual({ prefix: '[Lore]', suffix: '' });
    expect(parseComposition(JSON.parse(JSON.stringify(wrapped)))?.loreFraming).toEqual({
      prefix: '[Lore]',
      suffix: '',
    });
    expect(parseComposition(saved({ prefix: '', suffix: '' }))?.loreFraming).toBeUndefined();
  });
});

describe('トークン数の見積もり', () => {
  it('英数字は 4 文字で 1、空白は数えず、かな・漢字は 1 文字で 1', () => {
    expect(estimateText('abcd efgh')).toBe(2);
    expect(estimateText('日本語')).toBe(3);
  });

  it('最後に受け取った候補の実際の数で補正する', () => {
    const answered = chatMessage('a1', 'assistant', ['ok']);
    const withUsage = {
      ...answered,
      candidates: [{ ...answered.candidates[0]!, usage: { prompt: 1000, completion: 1 } }],
    };
    const plain = estimateChat(
      chat([chatMessage('u1', 'user', ['hello there'])]),
      sampleComposition(),
    );
    const scaled = estimateChat(
      chat([chatMessage('u1', 'user', ['hello there']), withUsage]),
      sampleComposition(),
    );
    expect(plain.lastActual).toBeNull();
    expect(scaled.lastActual).toBe(1000);
    // 比は 3 で止まる
    expect(scaled.history).toBeLessThanOrEqual((plain.history + 8) * 3);
    expect(scaled.history).toBeGreaterThan(plain.history);
  });
});

describe('位置で決まる role と段', () => {
  it('会話の履歴より前は system、後ろは user。深さの項目は項目の role', () => {
    const base = sampleComposition();
    const role = (id: string) =>
      roleOf(
        base.items,
        base.items.find((item) => item.id === id)!,
      );
    expect([role('tone'), role('task'), role('currentInput')]).toEqual(['system', 'user', 'user']);
    const moved = moveToSlot(base, 'task', null, 'tone')!;
    expect(roleOf(moved.items, moved.items[0]!)).toBe('system');
  });

  it('段は履歴の前・会話・履歴の後。深さの項目は会話の段に入る', () => {
    const depth = { kind: 'depth', depth: 2, order: 100 } as const;
    const base = updatePromptItem(sampleComposition(), 'tone', { position: depth })!;
    expect(sectionViews(base).map((view) => `${view.kind}:${view.items.length}`)).toEqual([
      'before:3',
      'history:2',
      'after:4',
    ]);
  });

  it('会話の段の深さの項目は、送る中身と同じ順（深い方が先）に並べる', () => {
    const at = (depth: number) => ({ kind: 'depth', depth, order: 100 }) as const;
    const one = updatePromptItem(sampleComposition(), 'tone', { position: at(1) })!;
    const base = updatePromptItem(one, 'rules', { position: at(4) })!;
    const history = sectionViews(base).find((view) => view.kind === 'history')!;
    expect(history.items.map((item) => item.id)).toEqual(['chatHistory', 'rules', 'tone']);
  });
});

describe('前後の行の間へ動かす', () => {
  const ids = (composition: PromptComposition): string[] =>
    composition.items.map((item) => item.id);
  const positionOf = (composition: PromptComposition, id: string): unknown =>
    composition.items.find((item) => item.id === id)?.position;

  it('深さの項目を帯の外へ動かすと、並びの項目に戻る', () => {
    const depth = { kind: 'depth', depth: 2, order: 100 } as const;
    const base = updatePromptItem(sampleComposition(), 'rules', { position: depth })!;
    const back = moveToSlot(base, 'rules', 'currentInput', 'task')!;
    expect(positionOf(back, 'rules')).toEqual({ kind: 'relative' });
    expect(ids(back).indexOf('rules')).toBe(ids(back).indexOf('task') - 1);
  });

  it('帯の上は履歴の前の段の最後、帯の下は履歴の後の段の最初', () => {
    const up = moveToSlot(sampleComposition(), 'task', 'examples', 'chatHistory')!;
    expect(ids(up).indexOf('task')).toBe(ids(up).indexOf('chatHistory') - 1);
    const down = moveToSlot(sampleComposition(), 'tone', 'currentInput', 'task')!;
    expect(ids(down).indexOf('tone')).toBe(ids(down).indexOf('task') - 1);
  });

  it('次の行が無ければ（プレフィルの上）、履歴の後の段の最後', () => {
    const moved = moveToSlot(sampleComposition(), 'tone', 'format', null)!;
    expect(moved.items.at(-1)?.id).toBe('tone');
  });

  it('有効かどうかは変えない。会話の履歴・メッセージは動かせない', () => {
    const off = updatePromptItem(sampleComposition(), 'tone', { enabled: false })!;
    const moved = moveToSlot(off, 'tone', 'task', 'thinking')!;
    expect(moved.items.find((item) => item.id === 'tone')?.enabled).toBe(false);
    expect(moveToSlot(sampleComposition(), 'chatHistory', 'task', 'thinking')).toBeNull();
    expect(moveToSlot(sampleComposition(), 'currentInput', 'tone', 'rules')).toBeNull();
  });
});

describe('履歴後の指示', () => {
  it('ほかの文面の項目と同じく動かせ、後ろへ動かした項目の手前に留めない', () => {
    const view = cardView({
      spec: 'chara_card_v2',
      data: { name: 'A', system_prompt: 'S', post_history_instructions: 'Stay.' },
    });
    const base = cardComposition(view);
    const up = moveToSlot(base, 'jailbreak', null, 'main');
    expect(up?.items[0]?.id).toBe('jailbreak');
    const moved = moveToSlot(base, 'main', 'jailbreak', null)!;
    expect(moved.items.at(-1)?.id).toBe('main');
  });

  it('読み戻しで無効の履歴後の指示を有効に戻さない', () => {
    const read = parseComposition({
      items: [{ id: 'jailbreak', role: 'system', content: 'X', enabled: false }],
    });
    expect(read?.items.find((item) => item.id === 'jailbreak')?.enabled).toBe(false);
  });
});

describe('項目を足す位置', () => {
  it('会話の履歴の手前（履歴の前の段の最後）に足す', () => {
    const added = addPromptItem(sampleComposition(), 'new');
    const ids = added.items.map((item) => item.id);
    expect(ids[ids.indexOf('chatHistory') - 1]).toBe('new');
  });

  it('履歴の後の段の最後に足す（履歴後の指示があってもその後ろ）', () => {
    const view = cardView({
      spec: 'chara_card_v2',
      data: { name: 'A', post_history_instructions: 'Stay.' },
    });
    const ids = addPromptItem(cardComposition(view), 'new', 'after').items.map((item) => item.id);
    expect(ids.slice(-2)).toEqual(['jailbreak', 'new']);
    expect(ids.indexOf('new')).toBeGreaterThan(ids.indexOf('currentInput'));
  });

  it('input はメッセージのすぐ後ろに足す', () => {
    const once = addPromptItem(sampleComposition(), 'first', 'input');
    const ids = addPromptItem(once, 'second', 'input').items.map((item) => item.id);
    const at = ids.indexOf('currentInput');
    expect(ids.slice(at, at + 3)).toEqual(['currentInput', 'second', 'first']);
  });

  it('履歴の印が無ければ、履歴の前の段はメッセージの手前', () => {
    const base = sampleComposition();
    const noHistory = {
      ...base,
      items: base.items.filter((item) => item.marker !== 'chatHistory'),
    };
    const ids = addPromptItem(noHistory, 'new').items.map((item) => item.id);
    expect(ids[ids.indexOf('currentInput') - 1]).toBe('new');
  });
});

describe('無効の項目', () => {
  it('無効の項目も段の中のその場に並ぶ', () => {
    const base = updatePromptItem(sampleComposition(), 'tone', { enabled: false })!;
    const before = sectionViews(base).find((view) => view.kind === 'before')!;
    expect(before.items.map((item) => item.id)).toEqual([
      'tone',
      'rules',
      'examples',
      'additionalInfo',
    ]);
  });
});

describe('項目を入れられる所', () => {
  it('履歴の前の段と、メッセージの下だけを入れられる所にする', () => {
    const slots = dropSlots(sampleComposition());
    expect(slots.get('tone')).toBe('before');
    expect(slots.get('additionalInfo')).toBe('before');
    expect(slots.get('chatHistory')).toBe('fixed');
    expect(slots.get('currentInput')).toBe('input');
    expect(slots.get('task')).toBe('after');
  });

  it('会話履歴の帯やメッセージの手前を指しても、メッセージのすぐ下に入れる', () => {
    const moved = moveToSlot(sampleComposition(), 'tone', 'chatHistory', 'currentInput');
    // 前の行が帯の中なら、帯の中ではなくメッセージの下
    const ids = moved?.items.map((item) => item.id) ?? [];
    expect(ids[ids.indexOf('currentInput') + 1]).toBe('tone');
  });
});
