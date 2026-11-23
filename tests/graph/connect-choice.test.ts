import { describe, expect, it } from 'vitest';

import { autoSlot, needsChoice, slotChoices } from '@/graph/connect-choice';

import { loadDefinitions } from '../helpers/fixtures';

const definitions = loadDefinitions();
const definition = (name: string) => {
  const found = definitions.get(name);
  if (!found) throw new Error(`定義が無い: ${name}`);
  return found;
};

describe('繋ぎ先の候補', () => {
  it('入力は widget を除いた並び（ノードのソケットと同じ位置）', () => {
    const choices = slotChoices(definition('CFGGuider'), 'CONDITIONING', 'input');

    expect(choices.map((choice) => choice.name)).toEqual(['model', 'positive', 'negative']);
    expect(choices.map((choice) => choice.matches)).toEqual([false, true, true]);
  });

  it('出力は定義の並びそのまま', () => {
    const choices = slotChoices(definition('LoadImage'), 'MASK', 'output');

    expect(choices.map((choice) => choice.type)).toEqual(['IMAGE', 'MASK']);
    expect(choices[1]?.matches).toBe(true);
  });
});

describe('自動で繋ぐか尋ねるか', () => {
  it('合う口がちょうど 1 つなら自動で繋ぐ', () => {
    const choices = slotChoices(definition('CFGGuider'), 'MODEL', 'input');

    expect(autoSlot(choices)).toBe(0);
    expect(needsChoice(choices)).toBe(false);
  });

  it('**2 つ以上あるときは尋ねる**（positive と negative を取り違えない）', () => {
    const choices = slotChoices(definition('CFGGuider'), 'CONDITIONING', 'input');

    expect(autoSlot(choices)).toBeNull();
    expect(needsChoice(choices)).toBe(true);
  });

  it('合う口が無いときも尋ねる（型を無視して繋ぐか、繋がないかを選べる）', () => {
    const choices = slotChoices(definition('CFGGuider'), 'IMAGE', 'input');

    expect(choices.every((choice) => !choice.matches)).toBe(true);
    expect(needsChoice(choices)).toBe(true);
  });

  it('繋げる口が 1 つも無ければ尋ねない（繋がずに足すだけ）', () => {
    const choices = slotChoices(definition('LoadImage'), 'IMAGE', 'input');

    expect(choices).toEqual([]);
    expect(needsChoice(choices)).toBe(false);
  });
});
