import { describe, expect, it } from 'vitest';

import {
  buildNodeDefinition,
  buildNodeDefinitions,
  buildNodeDefinitionsInSlices,
} from '@/graph/node-definition';

import { loadDefinitions } from '../helpers/fixtures';

describe('/object_info の射影', () => {
  it('display_name が null のときはクラス名にフォールバックする', () => {
    expect(loadDefinitions().get('RandomNoise')?.displayName).toBe('RandomNoise');
  });

  it('input_order の順に入力を並べる（input のキー順ではない）', () => {
    const definition = buildNodeDefinition('X', {
      input: {
        required: { b: ['INT', {}], a: ['INT', {}] },
        optional: { c: ['STRING', {}] },
      },
      input_order: { required: ['a', 'b'], optional: ['c'] },
    });

    expect(definition?.inputs.map((input) => input.name)).toEqual(['a', 'b', 'c']);
    expect(definition?.inputs.map((input) => input.required)).toEqual([true, true, false]);
  });

  it('COMBO の新旧2形式をどちらも認識する', () => {
    const legacy = buildNodeDefinition('L', {
      input: { required: { mode: [['a', 'b'], { default: 'a' }] } },
    });
    expect(legacy?.inputs[0]).toMatchObject({ type: 'COMBO', isWidget: true, options: ['a', 'b'] });

    const modern = buildNodeDefinition('M', {
      input: { required: { mode: ['COMBO', { options: ['a', 'b'] }] } },
    });
    expect(modern?.inputs[0]).toMatchObject({ type: 'COMBO', isWidget: true, options: ['a', 'b'] });
  });

  it('選択肢が射影に含まれない場合は options を null にする', () => {
    const definition = buildNodeDefinition('M', { input: { required: { mode: ['COMBO', {}] } } });
    expect(definition?.inputs[0]?.options).toBeNull();
    expect(definition?.inputs[0]?.isWidget).toBe(true);
  });

  it('forceInput は widget にしない', () => {
    const definition = buildNodeDefinition('F', {
      input: { required: { seed: ['INT', { forceInput: true }] } },
    });
    expect(definition?.inputs[0]?.isWidget).toBe(false);
  });

  it('接続専用の型は widget にしない', () => {
    const definition = buildNodeDefinition('C', {
      input: { required: { model: ['MODEL', {}], image: ['IMAGE', {}] } },
    });
    expect(definition?.inputs.map((input) => input.isWidget)).toEqual([false, false]);
  });

  it('出力は output と output_name から組む', () => {
    const definition = buildNodeDefinition('O', {
      output: ['LATENT', 'IMAGE'],
      output_name: ['latent', null],
      output_node: true,
    });
    expect(definition?.outputs).toEqual([
      { name: 'latent', type: 'LATENT' },
      { name: 'IMAGE', type: 'IMAGE' },
    ]);
    expect(definition?.outputNode).toBe(true);
  });

  it('壊れた入力は落とすが、他の入力は残す', () => {
    const definition = buildNodeDefinition('B', {
      input: { required: { ok: ['INT', {}], broken: 'not-an-array' } },
      input_order: { required: ['ok', 'broken'] },
    });
    expect(definition?.inputs.map((input) => input.name)).toEqual(['ok']);
  });

  it('レスポンス全体がオブジェクトでなければ空を返す', () => {
    expect(buildNodeDefinitions(null).size).toBe(0);
    expect(buildNodeDefinitions([]).size).toBe(0);
  });
});

describe('小分けの射影', () => {
  it('200 クラスずつ分けて合間に待ち、1 回で射影したときと同じ定義を作る', async () => {
    const raw = Object.fromEntries(
      Array.from({ length: 450 }, (_, index) => [
        `Node${String(index)}`,
        { input: { required: { value: ['INT', {}] } }, output: ['INT'] },
      ]),
    );
    let pauses = 0;
    const sliced = await buildNodeDefinitionsInSlices(raw, () => {
      pauses += 1;
      return Promise.resolve();
    });

    expect(pauses).toBe(2);
    expect(sliced).toEqual(buildNodeDefinitions(raw));
  });

  it('読めないクラスは外し、ほかは残す（1 回で射影したときと同じ）', async () => {
    const raw = { Good: { input: {} }, Bad: null };
    const sliced = await buildNodeDefinitionsInSlices(raw, () => Promise.resolve());
    expect([...sliced.keys()]).toEqual([...buildNodeDefinitions(raw).keys()]);
  });
});

describe('説明', () => {
  it('先頭 500 字だけ残し、無ければ空', () => {
    const long = buildNodeDefinition('Long', { description: 'あ'.repeat(600) });
    const none = buildNodeDefinition('None', {});

    expect(long?.description).toHaveLength(500);
    expect(none?.description).toBe('');
  });
});
