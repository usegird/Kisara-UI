import { describe, expect, it } from 'vitest';

import { syncChoiceInputs } from '@/graph/choice-inputs';
import { createNode } from '@/graph/create-node';
import { buildNodeDefinition } from '@/graph/node-definition';
import { toApiPrompt } from '@/graph/to-api-prompt';
import { nodeInputs, type NodeDefinition, type Workflow, type WorkflowNode } from '@/graph/types';
import { resolveWidgetValues, writeWidgetValue } from '@/graph/widgets';

import { definitionMap } from '../helpers/definitions';

const TEXT_GENERATE = {
  input: {
    required: {
      clip: ['CLIP', {}],
      prompt: ['STRING', { default: '', multiline: true }],
      max_length: ['INT', { default: 512, min: 1 }],
      sampling_mode: [
        'COMFY_DYNAMICCOMBO_V3',
        {
          display_name: 'Sampling Mode',
          options: [
            {
              key: 'on',
              inputs: {
                required: {
                  temperature: ['FLOAT', { default: 0.7 }],
                  seed: ['INT', { default: 0 }],
                },
                optional: { presence_penalty: ['FLOAT', { default: 0 }] },
              },
            },
            { key: 'off', inputs: { required: {} } },
          ],
        },
      ],
    },
    optional: {
      image: ['IMAGE', {}],
      thinking: ['BOOLEAN', { default: false }],
      mtp: ['COMBO', { default: 'auto', options: ['auto', 'off'] }],
    },
  },
  input_order: {
    required: ['clip', 'prompt', 'max_length', 'sampling_mode'],
    optional: ['image', 'thinking', 'mtp'],
  },
  output: ['STRING'],
  output_name: ['generated_text'],
  name: 'TextGenerate',
  output_node: true,
};

const SAVE_VIDEO = {
  input: {
    required: {
      format: [
        'COMFY_DYNAMICCOMBO_V3',
        {
          options: [
            { key: 'auto', inputs: { required: {} } },
            {
              key: 'mp4',
              inputs: {
                required: {
                  codec: [
                    'COMFY_DYNAMICCOMBO_V3',
                    {
                      options: [
                        { key: 'h264', inputs: { required: { crf: ['FLOAT', { default: 23 }] } } },
                        { key: 'copy', inputs: { required: {} } },
                      ],
                    },
                  ],
                  audio: ['AUDIO', {}],
                },
              },
            },
          ],
        },
      ],
      filename_prefix: ['STRING', { default: 'video/ComfyUI' }],
    },
  },
  input_order: { required: ['format', 'filename_prefix'] },
  output: [],
  name: 'SaveVideo',
  output_node: true,
};

function defineFrom(raw: Record<string, unknown>, dropOptions = false): NodeDefinition {
  const name = String(raw.name);
  const definition = buildNodeDefinition(name, raw, { dropOptions });
  if (!definition) throw new Error(`definition ${name} did not parse`);
  return definition;
}

const textGenerate = defineFrom(TEXT_GENERATE);
const saveVideo = defineFrom(SAVE_VIDEO);

const SAVED_ON = ['', 4096, 'on', 0.7, 0, 0, false, 'auto'];

function generateNode(values: unknown[], overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 11,
    type: 'TextGenerate',
    pos: [0, 0],
    inputs: [
      { name: 'clip', type: 'CLIP', link: null },
      { name: 'image', type: 'IMAGE', link: null },
    ],
    outputs: [{ name: 'generated_text', type: 'STRING', links: [] }],
    widgets_values: values,
    ...overrides,
  };
}

describe('選ぶ欄の定義の読み', () => {
  it('項目の鍵を選択肢に持つ選択肢の欄になり、組の入力は名前をつないで持つ', () => {
    const choice = textGenerate.inputs.find((input) => input.name === 'sampling_mode');
    expect(choice).toMatchObject({ type: 'COMBO', isWidget: true, options: ['on', 'off'] });
    expect(choice?.branches?.[0]?.inputs.map((input) => input.name)).toEqual([
      'sampling_mode.temperature',
      'sampling_mode.seed',
      'sampling_mode.presence_penalty',
    ]);
    expect(choice?.config).not.toHaveProperty('options');
  });

  it('選択肢を落としても項目の鍵と組は残し、組の中の選択肢だけ落とす', () => {
    const dropped = defineFrom(SAVE_VIDEO, true);
    const format = dropped.inputs.find((input) => input.name === 'format');
    expect(format?.options).toEqual(['auto', 'mp4']);
    const codec = format?.branches?.[1]?.inputs.find((input) => input.name === 'format.codec');
    expect(codec?.options).toEqual(['h264', 'copy']);
  });
});

describe('選ぶ欄の値の位置', () => {
  it('選んだ項目の組を選ぶ欄の直後に広げて値を当てる', () => {
    const resolved = resolveWidgetValues(generateNode(SAVED_ON), textGenerate);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(Object.fromEntries(resolved.byInput)).toEqual({
      prompt: '',
      max_length: 4096,
      sampling_mode: 'on',
      'sampling_mode.temperature': 0.7,
      'sampling_mode.seed': 0,
      'sampling_mode.presence_penalty': 0,
      thinking: false,
      mtp: 'auto',
    });
  });

  it('組の seed には名前の規則で制御の欄を足さない', () => {
    const resolved = resolveWidgetValues(generateNode(SAVED_ON), textGenerate);
    expect(resolved.slots.some((slot) => slot.kind === 'control_after_generate')).toBe(false);
  });

  it('中身の無い項目を選んだ並びも解ける', () => {
    const resolved = resolveWidgetValues(
      generateNode(['', 512, 'off', false, 'auto']),
      textGenerate,
    );
    expect(resolved.ok).toBe(true);
  });

  it('どの鍵とも合わない値なら組を広げず、数が合わなければ解かない', () => {
    const resolved = resolveWidgetValues(
      generateNode(['', 512, 'gone', 0.7, 0, 0, false, 'auto']),
      textGenerate,
    );
    expect(resolved).toMatchObject({ ok: false, reason: 'slot-count-mismatch' });
  });

  it('入れ子の選ぶ欄も、その位置の値で広げる', () => {
    const node = {
      id: 3,
      type: 'SaveVideo',
      pos: [0, 0] as [number, number],
      widgets_values: ['mp4', 'h264', 18, 'v'],
    };
    const resolved = resolveWidgetValues(node, saveVideo);
    expect(resolved.ok && resolved.byInput.get('format.codec.crf')).toBe(18);
    expect(resolved.inputs.map((input) => input.name)).toContain('format.audio');
  });

  it('選ぶ欄に線が繋がっていれば解かない', () => {
    const linked = generateNode(SAVED_ON, {
      inputs: [
        { name: 'sampling_mode', type: 'COMBO', widget: { name: 'sampling_mode' }, link: 7 },
      ],
    });
    expect(resolveWidgetValues(linked, textGenerate)).toMatchObject({
      ok: false,
      reason: 'linked-choice',
    });
  });
});

describe('選ぶ欄を持つノードを置く・送る', () => {
  it('新しいノードは先頭の項目で広げ、組の繋ぐ入力も口に持つ', () => {
    const created = createNode(saveVideo, 5);
    expect(created.widgets_values).toEqual(['auto', 'video/ComfyUI']);
    const created2 = createNode(textGenerate, 6);
    expect(created2.widgets_values).toEqual(['', 512, 'on', 0.7, 0, 0, false, 'auto']);
  });

  it('組の入力を `親.子` の名前で送る', () => {
    const workflow: Workflow = { nodes: [generateNode(SAVED_ON)], links: [] };
    const { prompt } = toApiPrompt(workflow, definitionMap(textGenerate));
    expect(prompt['11']?.inputs).toMatchObject({
      max_length: 4096,
      sampling_mode: 'on',
      'sampling_mode.temperature': 0.7,
      'sampling_mode.seed': 0,
    });
  });

  it('選ぶ欄に線が繋がったノードは送らず、理由を積む', () => {
    const linked = generateNode(SAVED_ON, {
      inputs: [
        { name: 'sampling_mode', type: 'COMBO', widget: { name: 'sampling_mode' }, link: 7 },
      ],
    });
    const { prompt, diagnostics } = toApiPrompt(
      { nodes: [linked], links: [] },
      definitionMap(textGenerate),
    );
    expect(prompt['11']).toBeUndefined();
    expect(diagnostics.map((item) => item.code)).toContain('misaligned-widgets');
  });
});

describe('選ぶ欄の選び直し', () => {
  it('前の組の値を外し、新しい組を既定の値で入れる。前後の値は動かさない', () => {
    const off = writeWidgetValue(generateNode(SAVED_ON), textGenerate, 'sampling_mode', 'off');
    expect(off?.widgets_values).toEqual(['', 4096, 'off', false, 'auto']);
    const on = off && writeWidgetValue(off, textGenerate, 'sampling_mode', 'on');
    expect(on?.widgets_values).toEqual(['', 4096, 'on', 0.7, 0, 0, false, 'auto']);
  });

  it('名前の写しが揃っていれば、組の部分の名前も差し替える', () => {
    const named = generateNode(['', 512, 'off', false, 'auto'], {
      widgets_values_named: {
        prompt: '',
        max_length: 512,
        sampling_mode: 'off',
        thinking: false,
        mtp: 'auto',
      },
    });
    const on = writeWidgetValue(named, textGenerate, 'sampling_mode', 'on');
    expect(Object.keys(on?.widgets_values_named ?? {})).toEqual([
      'prompt',
      'max_length',
      'sampling_mode',
      'sampling_mode.temperature',
      'sampling_mode.seed',
      'sampling_mode.presence_penalty',
      'thinking',
      'mtp',
    ]);
  });

  it('前の組だけにあった口を線ごと外し、後ろの口へ来ている線の番号を詰める', () => {
    const switched = writeWidgetValue(
      generateNode(SAVED_ON, {
        inputs: [
          { name: 'clip', type: 'CLIP', link: null },
          {
            name: 'sampling_mode.seed',
            type: 'INT',
            widget: { name: 'sampling_mode.seed' },
            link: 55,
          },
          { name: 'image', type: 'IMAGE', link: 53 },
        ],
      }),
      textGenerate,
      'sampling_mode',
      'off',
    );
    if (!switched) throw new Error('write refused');
    const workflow: Workflow = {
      nodes: [switched],
      links: [
        [55, 1, 0, 11, 1, 'INT'],
        [53, 2, 0, 11, 2, 'IMAGE'],
      ],
    };
    const synced = syncChoiceInputs(workflow, 11, textGenerate);
    expect(inputNames(synced)).toEqual(['clip', 'image']);
    expect(synced.links).toEqual([[53, 2, 0, 11, 1, 'IMAGE']]);
  });

  it('選んだ組の繋ぐ入力の口が無ければ足す', () => {
    const node: WorkflowNode = {
      id: 3,
      type: 'SaveVideo',
      pos: [0, 0],
      inputs: [],
      widgets_values: ['auto', 'v'],
    };
    const mp4 = writeWidgetValue(node, saveVideo, 'format', 'mp4');
    expect(mp4?.widgets_values).toEqual(['mp4', 'h264', 23, 'v']);
    if (!mp4) return;
    const synced = syncChoiceInputs({ nodes: [mp4], links: [] }, 3, saveVideo);
    expect(inputNames(synced)).toEqual(['format.audio']);
  });
});

function inputNames(workflow: Workflow): string[] {
  const first = workflow.nodes[0];
  return first ? nodeInputs(first).map((slot) => slot.name) : [];
}
