import { describe, expect, it } from 'vitest';

import { definitionOf } from '@/graph/frontend-nodes';
import { writeWidgetValue } from '@/graph/widgets';

describe('フロントエンド専用ノードの定義', () => {
  it('メモは定義が無くても本文 1 つの定義を引け、本文を書き込める', () => {
    const definition = definitionOf(new Map(), 'Note');
    if (!definition) throw new Error('定義が引けない');
    const note = { id: 1, type: 'Note', pos: [0, 0] as [number, number], widgets_values: ['a'] };

    expect(writeWidgetValue(note, definition, 'text', 'b')?.widgets_values).toEqual(['b']);
  });

  it('メモ以外の定義の無いノードは引けない', () => {
    expect(definitionOf(new Map(), 'Fast Groups Muter (rgthree)')).toBeUndefined();
  });
});
