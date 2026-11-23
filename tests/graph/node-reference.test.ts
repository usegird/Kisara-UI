import { describe, expect, it } from 'vitest';

import { referenceNodes, referenceSlots } from '@/graph/node-reference';
import { NO_FILTERS } from '@/graph/search';

import { definition, matchesFilters, socket } from '../helpers/definitions';
import { nodeRow, nodeView } from '../helpers/views';

const views = [
  nodeView({
    id: 1,
    index: '1',
    displayName: 'Load Image',
    outputs: [
      { name: 'IMAGE', type: 'IMAGE', values: [] },
      { name: 'MASK', type: 'MASK', values: [] },
    ],
  }),
  nodeView({
    id: 2,
    index: '2',
    displayName: 'Reroute',
    outputs: [{ name: 'out', type: '*', values: [] }],
    rows: [nodeRow({ name: 'in', label: 'in', type: '*', kind: 'link', inputSlot: 0 })],
  }),
  nodeView({
    id: 3,
    index: '3',
    displayName: 'Scale',
    comment: '拡大',
    outputs: [{ name: 'IMAGE', type: 'IMAGE', values: [] }],
    rows: [
      nodeRow({ name: 'image', label: 'image', type: 'IMAGE', kind: 'link', inputSlot: 0 }),
      nodeRow({ name: 'scale', label: 'scale', type: 'FLOAT', widgetName: 'scale' }),
      nodeRow({ name: 'method', label: 'method', type: 'COMBO', linkable: false }),
    ],
  }),
];
const options = { exclude: 3, type: 'IMAGE', anyType: true, query: '' };

describe('ノード参照の候補', () => {
  it('入力から開いたら、起点を除くノードの出力のうち型が合うものを並べる（* も合う）', () => {
    const slots = referenceSlots(views, 'outputs', options);

    expect(slots.map((slot) => `${slot.nodeId}:${slot.name}`)).toEqual(['1:IMAGE', '2:out']);
  });

  it('「* を含む」を外すと、型が一致するものだけにする', () => {
    const slots = referenceSlots(views, 'outputs', { ...options, anyType: false });

    expect(slots.map((slot) => slot.nodeId)).toEqual([1]);
  });

  it('出力から開いたら、線を受けられる入力（パラメータを含む）を並べる', () => {
    const slots = referenceSlots(views, 'inputs', { ...options, exclude: 1, type: '' });

    expect(slots.map((slot) => `${slot.nodeId}:${slot.name}`)).toEqual([
      '2:in',
      '3:image',
      '3:scale',
    ]);
    expect(slots.find((slot) => slot.name === 'scale')?.widget).toEqual({
      name: 'scale',
      type: 'FLOAT',
    });
    expect(slots.find((slot) => slot.name === 'image')?.linked).toBe(true);
  });

  it('名前はノード名（コメント優先）と口の名前で絞り、左の一覧は候補のあるノードだけ', () => {
    const slots = referenceSlots(views, 'inputs', {
      ...options,
      exclude: 1,
      type: '',
      query: '拡大',
    });

    expect(slots.map((slot) => slot.nodeLabel)).toEqual(['拡大', '拡大']);
    expect(referenceNodes(slots)).toEqual([
      { nodeId: 3, nodeIndex: '3', nodeLabel: '拡大', count: 2 },
    ]);
  });
});

describe('ノード追加の型の絞り込み', () => {
  const reroute = definition('Reroute', [socket('in', '*')]);

  it('何にでも繋がる口は既定で合う。「* を含む」を外すと合わない', () => {
    expect(matchesFilters(reroute, { ...NO_FILTERS, input: 'IMAGE' })).toBe(true);
    expect(matchesFilters(reroute, { ...NO_FILTERS, input: 'IMAGE', anyType: false })).toBe(false);
  });
});
