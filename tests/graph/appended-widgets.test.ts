import { describe, expect, it } from 'vitest';

import type { InputDefinition } from '@/graph/types';
import { resolveWidgetValues, writeWidgetValue } from '@/graph/widgets';

import { definition, widget } from '../helpers/definitions';
import { bareNode } from '../helpers/workflow';

function optional(input: InputDefinition): InputDefinition {
  return { ...input, required: false };
}

const SAMPLING: InputDefinition = {
  ...widget('sampling_mode', 'COMFY_DYNAMICCOMBO_V3'),
  branches: [
    {
      key: 'on',
      inputs: [
        widget('sampling_mode.temperature', 'FLOAT', { min: 0.01, max: 2 }),
        widget('sampling_mode.seed', 'INT', { min: 0 }),
      ],
    },
    { key: 'off', inputs: [] },
  ],
};

const TEXT_GENERATE = definition('TextGenerate', [
  widget('prompt', 'STRING'),
  widget('max_length', 'INT', { min: 1, max: 32768 }),
  SAMPLING,
  optional(widget('thinking', 'BOOLEAN')),
  optional(widget('use_default_template', 'BOOLEAN', { default: true })),
  optional({ ...widget('mtp', 'COMBO', { default: 'auto' }), options: ['auto', 'off', '2'] }),
]);

const SAVED = ['', 512, 'on', 0.7, 0, true, true];

function nodeWith(values: readonly unknown[]) {
  return bareNode({ id: 1, type: 'TextGenerate', widgets_values: [...values] });
}

describe('末尾に足された欄', () => {
  it('末尾だけが欠けた読み方しか成り立たなければ読み、足りない欄は既定値にする', () => {
    const resolved = resolveWidgetValues(nodeWith(SAVED), TEXT_GENERATE);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.appended).toEqual(['mtp']);
    expect(resolved.byInput.get('mtp')).toBe('auto');
    expect(resolved.byInput.get('max_length')).toBe(512);
  });

  it('足りない欄を書き換えたときだけ配列に足し、ほかの欄の書き換えでは並びを変えない', () => {
    const node = nodeWith(SAVED);

    expect(writeWidgetValue(node, TEXT_GENERATE, 'mtp', 'off')?.widgets_values).toEqual([
      ...SAVED,
      'off',
    ]);
    expect(writeWidgetValue(node, TEXT_GENERATE, 'max_length', 64)?.widgets_values).toHaveLength(
      SAVED.length,
    );
  });

  it('同じ型が続く所に挟まったかもしれず、並べ方が 2 つ成り立てば読まない', () => {
    const floats = definition('F', [
      widget('a', 'FLOAT'),
      optional(widget('b', 'FLOAT')),
      optional(widget('c', 'FLOAT')),
    ]);

    expect(resolveWidgetValues(bareNode({ widgets_values: [0.5, 0.7] }), floats).ok).toBe(false);
  });

  it('途中に挟まった読み方だけが成り立つなら読まない', () => {
    const inserted = definition('I', [
      widget('a', 'INT'),
      optional(widget('flag', 'BOOLEAN')),
      optional(widget('b', 'INT')),
    ]);

    expect(resolveWidgetValues(bareNode({ widgets_values: [1, 2] }), inserted).ok).toBe(false);
  });

  it('足りない欄が必須の入力なら読まない', () => {
    const required = definition('R', [widget('a', 'STRING'), widget('b', 'BOOLEAN')]);

    expect(resolveWidgetValues(bareNode({ widgets_values: ['x'] }), required).ok).toBe(false);
  });

  it('前の値が下限・上限の外なら読まない', () => {
    const ranged = definition('N', [
      widget('size', 'INT', { min: 1, max: 10 }),
      optional(widget('extra', 'BOOLEAN')),
    ]);

    expect(resolveWidgetValues(bareNode({ widgets_values: [99] }), ranged).ok).toBe(false);
    expect(resolveWidgetValues(bareNode({ widgets_values: [5] }), ranged).ok).toBe(true);
  });
});
