import { describe, expect, it } from 'vitest';

import { previewNodeView } from '@/graph/node-preview';

import { definition, definitionMap, socket, widget } from '../helpers/definitions';

// ─────────────────────────────
// ノードの追加の候補のカードの見本。足したときと同じ既定値で組む。
// ─────────────────────────────

describe('previewNodeView', () => {
  it('定義の入力・パラメータ・出力を、既定値の入ったカードにする', () => {
    const scale = definition(
      'Scale',
      [socket('image', 'IMAGE'), widget('megapixels', 'FLOAT', { default: 1 })],
      { outputs: [{ name: 'IMAGE', type: 'IMAGE' }] },
    );
    const view = previewNodeView(scale, definitionMap(scale));

    expect(view?.rows.map((row) => [row.name, row.kind])).toEqual([
      ['image', 'socket'],
      ['megapixels', 'widget'],
    ]);
    expect(view?.rows[1]?.value).toBe(1);
    expect(view?.outputs.map((output) => output.name)).toEqual(['IMAGE']);
  });
});
