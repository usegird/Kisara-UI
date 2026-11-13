import { describe, expect, it } from 'vitest';

import { advanceSeeds, nextSeed } from '@/graph/seed-control';
import type { Workflow } from '@/graph/types';
import { widgetValueList } from '@/graph/widgets';

import { definition, definitionMap, widget } from '../helpers/definitions';

// ─────────────────────────────
// control_after_generate は**サーバーに送るものではない**。
// ComfyUI 本家と同じく、キューに入れた直後にフロントエンド側で seed を書き換える。
// ─────────────────────────────

const definitions = definitionMap(
  definition(
    'KSampler',
    [
      widget('seed', 'INT', { control_after_generate: true, min: 0, max: 100 }),
      widget('steps', 'INT', { default: 20 }),
    ],
    { outputs: [{ name: 'LATENT', type: 'LATENT' }] },
  ),
);

/** widgets_values は [seed, control, steps] の並び（スロット順） */
function workflow(seed: number, control: string): Workflow {
  return {
    nodes: [{ id: 1, type: 'KSampler', pos: [0, 0], widgets_values: [seed, control, 20] }],
    links: [],
  };
}

describe('次の seed', () => {
  it('increment / decrement は 1 ずつ動く', () => {
    expect(nextSeed(5, 'increment', { min: 0, max: 100 })).toBe(6);
    expect(nextSeed(5, 'decrement', { min: 0, max: 100 })).toBe(4);
  });

  it('範囲を出ない', () => {
    expect(nextSeed(100, 'increment', { min: 0, max: 100 })).toBe(100);
    expect(nextSeed(0, 'decrement', { min: 0, max: 100 })).toBe(0);
  });

  it('randomize は min〜max に入る', () => {
    expect(nextSeed(0, 'randomize', { min: 10, max: 20 }, () => 0)).toBe(10);
    expect(nextSeed(0, 'randomize', { min: 10, max: 20 }, () => 0.999999)).toBe(20);
  });

  it('fixed は動かさない', () => {
    expect(nextSeed(7, 'fixed', {})).toBe(7);
  });

  it('max が JS の整数精度を超えても壊れない', () => {
    const value = nextSeed(0, 'randomize', { min: 0, max: 2 ** 64 }, () => 0.5);

    expect(Number.isSafeInteger(value)).toBe(true);
  });
});

describe('実行後の seed 更新', () => {
  it('randomize のノードだけ書き換える', () => {
    const next = advanceSeeds(workflow(5, 'randomize'), definitions, () => 0.5);

    const first = next.nodes[0];
    const values = first ? widgetValueList(first) : [];
    expect(values[0]).not.toBe(5);
    // 制御 widget と後続の値は動かさない
    expect(values[1]).toBe('randomize');
    expect(values[2]).toBe(20);
  });

  it('fixed なら同じ参照を返す（編集済みにしない）', () => {
    const before = workflow(5, 'fixed');

    expect(advanceSeeds(before, definitions, () => 0.5)).toBe(before);
  });

  it('定義が引けないノードは触らない', () => {
    const before: Workflow = {
      nodes: [{ id: 1, type: 'Unknown', pos: [0, 0], widgets_values: [5, 'randomize'] }],
      links: [],
    };

    expect(advanceSeeds(before, definitions, () => 0.5)).toBe(before);
  });

  it('値の位置が解決できないノードは触らない', () => {
    const broken: Workflow = {
      nodes: [{ id: 1, type: 'KSampler', pos: [0, 0], widgets_values: [5] }],
      links: [],
    };

    expect(advanceSeeds(broken, definitions, () => 0.5)).toBe(broken);
  });

  it('接続済みの seed は触らない（値は上流から来る）', () => {
    const linked: Workflow = {
      nodes: [
        {
          id: 1,
          type: 'KSampler',
          pos: [0, 0],
          inputs: [{ name: 'seed', type: 'INT', link: 7 }],
          widgets_values: [5, 'randomize', 20],
        },
      ],
      links: [],
    };

    expect(advanceSeeds(linked, definitions, () => 0.5)).toBe(linked);
  });
});
