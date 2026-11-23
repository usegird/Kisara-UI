import { describe, expect, it } from 'vitest';

import {
  parseHistoryRuns,
  parseRunHistoryFile,
  serializeRunHistoryFile,
} from '@/comfy/run-history';
import { outputPath, outputRefOf } from '@/graph/run-record';
import type { RunHistoryFile } from '@/port/run-history';

const FILE: RunHistoryFile = {
  workflows: {
    k1: {
      model: ['base.safetensors'],
      lora: [],
      other: ['vae.safetensors'],
      nodes: { '3': ['KSampler'], '59:7': ['CLIP Text Encode', 'inner'] },
      seeds: [['3', 'seed']],
      prompts: [
        ['6', 'text', 'posi'],
        ['59:7', 'text', null],
      ],
    },
  },
  prompts: { p1: ['a cat'] },
  runs: [
    { start: 10, end: 15, paths: ['a.png'], workflow: 'k1', prompt: 'p1', seeds: [42] },
    { start: 20, end: null, paths: ['b.png'], workflow: null, prompt: null, seeds: [] },
  ],
};

describe('serializeRunHistoryFile / parseRunHistoryFile', () => {
  it('書いた形を読み戻すと同じ中身になる', () => {
    expect(parseRunHistoryFile(JSON.parse(serializeRunHistoryFile(FILE)))).toEqual(FILE);
  });

  it('版 5 で書き、1 件は [開始, 完了, パス, …]。Workflow JSON の無い実行は時刻とパスだけ', () => {
    const raw = JSON.parse(serializeRunHistoryFile(FILE)) as { v: number; runs: unknown[] };

    expect(raw.v).toBe(5);
    expect(raw.runs[0]).toEqual([10, 15, ['a.png'], 'k1', 'p1', [42]]);
    expect(raw.runs[1]).toEqual([20, null, ['b.png']]);
  });

  it('版や形が違えば null', () => {
    expect(parseRunHistoryFile({ v: 4, workflows: {}, prompts: {}, runs: [] })).toBeNull();
    expect(parseRunHistoryFile({ v: 5, workflows: {}, prompts: {} })).toBeNull();
    expect(parseRunHistoryFile('x')).toBeNull();
  });

  it('読めない 1 件・置き場の壊れた骨組みは外す', () => {
    const parsed = parseRunHistoryFile({
      v: 5,
      workflows: {
        bad: { model: [], lora: [], other: [], seeds: [['3']], prompts: [] },
        role: { model: [], lora: [], other: [], seeds: [], prompts: [['3', 'x', 'pos']] },
      },
      prompts: {},
      runs: [
        ['x', null, []],
        [5, null, ['a.png']],
      ],
    });

    expect(parsed?.workflows).toEqual({});
    expect(parsed?.runs).toHaveLength(1);
  });
});

describe('outputPath / outputRefOf', () => {
  it('output は印を付けず、ほかは置き場の印を付け、読み戻せる', () => {
    const temp = { filename: 'p.png', subfolder: 'a/b', type: 'temp' };

    expect(outputPath({ filename: 'o.png', subfolder: '', type: 'output' })).toBe('o.png');
    expect(outputPath(temp)).toBe('a/b/p.png [temp]');
    expect(outputRefOf('a/b/p.png [temp]')).toEqual(temp);
    expect(outputRefOf('o.png')).toEqual({ filename: 'o.png', subfolder: '', type: 'output' });
  });
});

describe('parseHistoryRuns', () => {
  it('開始時刻・送った Workflow JSON・送り元・出力のパス（保存していないものは印付き）を取り出す', () => {
    const workflow = { nodes: [], links: [] };
    const [run] = parseHistoryRuns({
      p1: {
        prompt: [
          1,
          'p1',
          {},
          { client_id: 'c1', kisara: { session: 'tab-1' }, extra_pnginfo: { workflow } },
          [],
        ],
        outputs: {
          '9': {
            images: [
              { filename: 'a.png', subfolder: 'x', type: 'output' },
              { filename: 't.png', subfolder: '', type: 'temp' },
            ],
          },
        },
        status: {
          messages: [
            ['execution_start', { timestamp: 2000 }],
            ['execution_success', { timestamp: 5000 }],
          ],
        },
      },
    });

    expect(run).toEqual({
      promptId: 'p1',
      startedAt: 2000,
      finishedAt: 5000,
      paths: ['x/a.png', 't.png [temp]'],
      workflow,
      session: 'tab-1',
    });
  });

  it('Workflow JSON が添えられていなければ null', () => {
    const [run] = parseHistoryRuns({ p1: { prompt: [1, 'p1', {}, {}, []] } });

    expect(run).toMatchObject({ workflow: null, startedAt: null, paths: [] });
  });
});
