import { describe, expect, it } from 'vitest';

import {
  MIN_MULTILINE_HEIGHT,
  multilineHeight,
  withMultilineHeight,
} from '@/graph/multiline-height';

import { definition, socket, widget } from '../helpers/definitions';
import { node } from '../helpers/workflow';

const textNode = definition('Text', [
  socket('clip', 'CLIP'),
  widget('text', 'STRING', { multiline: true }),
]);

describe('複数行の入力の高さ', () => {
  it('size が無ければ既定の高さに任せる（null）', () => {
    expect(multilineHeight(node(1, 'Text'), textNode)).toBeNull();
  });

  it('書いた高さをそのまま読み戻せる。幅は変えない', () => {
    const resized = withMultilineHeight(node(1, 'Text', { size: [320, 90] }), textNode, 150);

    expect(resized.size?.[0]).toBe(320);
    expect(multilineHeight(resized, textNode)).toBe(150);
  });

  it('大きいノードほど高くなる', () => {
    const small = multilineHeight(node(1, 'Text', { size: [320, 120] }), textNode) ?? 0;
    const large = multilineHeight(node(1, 'Text', { size: [320, 300] }), textNode) ?? 0;

    expect(large).toBeGreaterThan(small);
  });

  it('下限より縮めない', () => {
    const resized = withMultilineHeight(node(1, 'Text', { size: [320, 90] }), textNode, 5);

    expect(multilineHeight(resized, textNode)).toBe(MIN_MULTILINE_HEIGHT);
  });

  it('複数行の入力が無いノードは触らない', () => {
    const plain = definition('Plain', [widget('steps', 'INT')]);
    const target = node(1, 'Plain', { size: [320, 90] });

    expect(withMultilineHeight(target, plain, 150)).toBe(target);
    expect(multilineHeight(target, plain)).toBeNull();
  });

  it('複数行の入力の 1 つを線で繋いで 1 行になっても、残りの高さは変えない', () => {
    const twoTexts = definition('Two', [
      widget('a', 'STRING', { multiline: true }),
      widget('b', 'STRING', { multiline: true }),
    ]);
    const free = node(1, 'Two', { inputs: [], size: [320, 300] });
    const linked = node(1, 'Two', {
      inputs: [{ name: 'a', type: 'STRING', widget: { name: 'a' }, link: 5 }],
      size: [320, 300],
    });

    expect(multilineHeight(linked, twoTexts)).toBe(multilineHeight(free, twoTexts));
  });
});
