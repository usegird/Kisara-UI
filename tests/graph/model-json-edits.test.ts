import { describe, expect, it } from 'vitest';

import {
  applyModelJsonEdit,
  mergeModelJson,
  modelJsonFields,
  parseModelJsonEdits,
  parseWeightInput,
  serializeModelJsonEdits,
  type ModelJsonSource,
} from '@/graph/model-json-edits';

function source(edits: Array<[string, string | number]> = []): ModelJsonSource {
  return {
    original: [
      { key: 'activation text', value: 'kisara' },
      { key: 'preferred weight', value: '0', structured: true },
      { key: 'tags', value: '[\n  "a"\n]', structured: true },
    ],
    edits: new Map(edits),
  };
}

describe('重ね方', () => {
  it('差分のキーが勝ち、元に無いキーは後ろに足す', () => {
    const merged = mergeModelJson(
      source([
        ['activation text', 'new'],
        ['extra', 'x'],
      ]),
    );

    expect(merged.map((entry) => `${entry.key}=${entry.value}`)).toEqual([
      'activation text=new',
      'preferred weight=0',
      'tags=[\n  "a"\n]',
      'extra=x',
    ]);
  });

  it('元が無いときは差分だけ', () => {
    expect(mergeModelJson({ original: null, edits: new Map([['a', 'b']]) })).toEqual([
      { key: 'a', value: 'b' },
    ]);
  });
});

describe('出す項目', () => {
  it('常に出す 3 つを決まった順で先頭に、ほかの値のあるキーをファイルの順で後ろに出す', () => {
    const keys = modelJsonFields(source()).map((field) => field.key);

    expect(keys).toEqual(['activation text', 'negative text', 'preferred weight', 'tags']);
  });

  it('description・notes は値があるときだけ常に出す 3 つの次に出し、読むだけにする', () => {
    const fields = modelJsonFields({
      original: [
        { key: 'tags', value: 'x' },
        { key: 'notes', value: 'n' },
        { key: 'description', value: 'Unknown' },
      ],
      edits: new Map(),
    });

    expect(fields.map((field) => field.key)).toEqual([
      'activation text',
      'negative text',
      'preferred weight',
      'notes',
      'tags',
    ]);
    expect(fields.find((field) => field.key === 'notes')?.editable).toBe(false);
  });

  it('推奨の強さの未定義（0・無い）は値を出さない', () => {
    const weightOf = (value: ModelJsonSource): string | undefined =>
      modelJsonFields(value).find((field) => field.key === 'preferred weight')?.value;

    expect(weightOf(source())).toBe('');
    expect(weightOf({ original: null, edits: new Map() })).toBe('');
    expect(weightOf(source([['preferred weight', 0.7]]))).toBe('0.7');
  });

  it('文字でない元の値は読むだけ。推奨の強さは数でも編集できる', () => {
    const fields = new Map(modelJsonFields(source()).map((field) => [field.key, field.editable]));

    expect(fields.get('tags')).toBe(false);
    expect(fields.get('preferred weight')).toBe(true);
    expect(fields.get('negative text')).toBe(true);
  });
});

describe('1 キーの書き換え', () => {
  it('元と違えば差分に入れ、元と同じに戻したら外す', () => {
    const edited = applyModelJsonEdit(source(), 'activation text', 'new');
    expect(edited.get('activation text')).toBe('new');

    const back = applyModelJsonEdit(
      source([['activation text', 'new']]),
      'activation text',
      'kisara',
    );
    expect(back.has('activation text')).toBe(false);
  });

  it('推奨の強さは 0.1 刻みに丸めた数にし、未定義を 1 とみなして元と同じなら外す', () => {
    expect(applyModelJsonEdit(source(), 'preferred weight', -0.75).get('preferred weight')).toBe(
      -0.8,
    );
    expect(applyModelJsonEdit(source([['preferred weight', 2]]), 'preferred weight', 1).size).toBe(
      0,
    );
  });

  it('推奨の強さの欄は、空・数でなければ 1、負の数も読む', () => {
    expect(parseWeightInput('')).toBe(1);
    expect(parseWeightInput('abc')).toBe(1);
    expect(parseWeightInput('-1.23')).toBe(-1.2);
  });
});

describe('差分の保存の形', () => {
  it('文字と有限の数だけを読み、物でなければ空', () => {
    const edits = parseModelJsonEdits({ a: 'x', w: 0.5, bad: [1], inf: null });

    expect([...edits.entries()]).toEqual([
      ['a', 'x'],
      ['w', 0.5],
    ]);
    expect(parseModelJsonEdits([1]).size).toBe(0);
  });

  it('書いた形を読み戻せる。__proto__ のキーも自分のキーとして書く', () => {
    const edits = new Map<string, string | number>([
      ['__proto__', 'x'],
      ['w', -0.1],
    ]);
    const text = serializeModelJsonEdits(edits);

    expect([...parseModelJsonEdits(JSON.parse(text)).entries()]).toEqual([...edits.entries()]);
  });
});
