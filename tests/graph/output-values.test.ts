import { describe, expect, it } from 'vitest';

import { createOutputValues } from '@/graph/output-values';

import { definition, definitionMap, socket, widget } from '../helpers/definitions';

const definitions = definitionMap(
  definition('CheckpointLoaderSimple', [widget('ckpt_name', 'COMBO')], {
    displayName: 'Load Checkpoint',
    outputs: [
      { name: 'MODEL', type: 'MODEL' },
      { name: 'CLIP', type: 'CLIP' },
    ],
  }),
  definition(
    'ModelSamplingDiscrete',
    [socket('model', 'MODEL'), widget('sampling', 'COMBO'), widget('zsnr', 'BOOLEAN')],
    { outputs: [{ name: 'MODEL', type: 'MODEL' }] },
  ),
  definition('RescaleCFG', [socket('model', 'MODEL'), widget('multiplier', 'FLOAT')], {
    outputs: [{ name: 'MODEL', type: 'MODEL' }],
  }),
);

const workflow = {
  nodes: [
    {
      id: 4,
      type: 'CheckpointLoaderSimple',
      pos: [0, 0] as [number, number],
      widgets_values: ['anime/stein.safetensors'],
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [1] },
        { name: 'CLIP', type: 'CLIP', links: null },
      ],
    },
    {
      id: 46,
      type: 'ModelSamplingDiscrete',
      pos: [100, 0] as [number, number],
      widgets_values: ['v_prediction', true],
      inputs: [{ name: 'model', type: 'MODEL', link: 1 }],
      outputs: [{ name: 'MODEL', type: 'MODEL', links: [2] }],
    },
    {
      id: 47,
      type: 'RescaleCFG',
      pos: [200, 0] as [number, number],
      widgets_values: [0.6],
      inputs: [{ name: 'model', type: 'MODEL', link: 2 }],
      outputs: [{ name: 'MODEL', type: 'MODEL', links: null }],
    },
  ],
  links: [
    [1, 4, 0, 46, 0, 'MODEL'] as [number, number, number, number, number, string],
    [2, 46, 0, 47, 0, 'MODEL'] as [number, number, number, number, number, string],
  ],
};

describe('出力に流れる値', () => {
  const resolve = createOutputValues(workflow, definitions);
  const value = (nodeId: number, slot: number) => resolve(nodeId, slot).map((part) => part.text);
  const labels = (nodeId: number, slot: number) => resolve(nodeId, slot).map((part) => part.label);

  it('自分の設定値だけのノードはそのまま', () => {
    expect(value(4, 0)).toEqual(['anime/stein.safetensors']);
  });

  it('素通し系は上流の値を前に置く', () => {
    expect(value(46, 0)).toEqual(['anime/stein.safetensors', 'v_prediction', 'ON']);
  });

  it('連なっていても辿る', () => {
    expect(value(47, 0)).toEqual(['anime/stein.safetensors', 'v_prediction', 'ON', '0.6']);
  });

  it('型が合う入力だけを辿る（CLIP 出力に MODEL は混ぜない）', () => {
    expect(value(4, 1)).toEqual(['anime/stein.safetensors']);
  });

  it('数値・真偽にはパラメータ名を付けた行も持つ', () => {
    expect(labels(47, 0)).toEqual([
      'anime/stein.safetensors',
      'v_prediction',
      'zsnr: ON',
      'multiplier: 0.6',
    ]);
  });

  it('循環していても止まる', () => {
    const looped = {
      nodes: [
        {
          id: 1,
          type: 'RescaleCFG',
          pos: [0, 0] as [number, number],
          widgets_values: [0.5],
          inputs: [{ name: 'model', type: 'MODEL', link: 9 }],
          outputs: [{ name: 'MODEL', type: 'MODEL', links: [9] }],
        },
      ],
      links: [[9, 1, 0, 1, 0, 'MODEL'] as [number, number, number, number, number, string]],
    };

    expect(createOutputValues(looped, definitions)(1, 0).map((part) => part.text)).toEqual(['0.5']);
  });

  it('バイパス中のノードの値は「使われない」印が付く', () => {
    const bypassed = {
      ...workflow,
      nodes: workflow.nodes.map((node) => (node.id === 46 ? { ...node, mode: 4 } : node)),
    };
    const parts = createOutputValues(bypassed, definitions)(47, 0);

    expect(parts.map((part) => [part.text, part.bypassed])).toEqual([
      ['anime/stein.safetensors', false],
      ['v_prediction', true],
      ['ON', true],
      ['0.6', false],
    ]);
  });
});
