import { describe, expect, it } from 'vitest';

import { subfolderFixesOf } from '@/graph/model-subfolder';

import { nodeRow, nodeView } from '../helpers/views';

const TARGET = { kind: 'node', nodeId: 3, classType: 'AnyLoader' } as const;

function comboView(value: unknown, options: readonly unknown[] | null) {
  const row = nodeRow({ type: 'COMBO', value, options, target: TARGET, widgetName: 'file' });
  return nodeView({ id: 3, rows: [row] });
}

describe('サブフォルダの名前への書き換え', () => {
  it('根に無く、同じ名前がサブフォルダに 1 つだけあれば、その選択肢の文字に書き換える', () => {
    const view = comboView('a.safetensors', ['b.safetensors', 'flux\\a.safetensors']);
    const fixes = subfolderFixesOf([view]);

    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ viewId: 3, from: 'a.safetensors', to: 'flux\\a.safetensors' });
  });

  it('選択肢にある・同じ名前が 2 つ以上ある・フォルダを書いた値・選択肢が未取得なら書き換えない', () => {
    const views = [
      comboView('a.safetensors', ['a.safetensors', 'x/a.safetensors']),
      comboView('a.safetensors', ['x/a.safetensors', 'y/a.safetensors']),
      comboView('old/a.safetensors', ['x/a.safetensors']),
      comboView('a.safetensors', null),
      comboView('a.safetensors', ['x/b.safetensors']),
    ];

    expect(subfolderFixesOf(views)).toEqual([]);
  });

  it('選ぶ欄でない・書き込み先の無い行は見ない', () => {
    const notCombo = nodeView({
      rows: [nodeRow({ type: 'STRING', value: 'a.safetensors', options: ['x/a.safetensors'] })],
    });
    const readOnly = nodeView({
      rows: [nodeRow({ type: 'COMBO', value: 'a.safetensors', options: ['x/a.safetensors'] })],
    });

    expect(subfolderFixesOf([notCombo, readOnly])).toEqual([]);
  });
});
