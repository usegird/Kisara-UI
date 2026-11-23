// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resetStats, statCount } from '@/lib/perf-stats';

import { settle, setupChainCanvas, setupFlowCanvas } from '../helpers/flow-canvas';
import { storedNodeOrder } from '../helpers/graph-store';

setupFlowCanvas();

describe('描き直しの回数（カードの並べ替え・行の落とし先）', () => {
  setupChainCanvas();

  it('カードの並べ替え（キーボードで 3 段下げる）', async () => {
    const handle = screen.getAllByRole('button', { name: 'Step を並べ替える' })[0] as Element;
    const press = async (code: string, key: string): Promise<void> => {
      fireEvent.keyDown(handle, { code, key });
      await settle();
    };
    await press('Space', ' ');
    expect(document.querySelector('[data-dragging]')).not.toBeNull();
    const column = document.querySelector('[data-dragging] [data-flow-scroll]');
    expect(column?.className).toContain('in-data-dragging:[overflow-anchor:none]');
    for (let step = 0; step < 3; step++) await press('ArrowDown', 'ArrowDown');
    await press('Space', ' ');
    expect(document.querySelector('[data-dragging]')).toBeNull();

    expect(storedNodeOrder().indexOf(1)).toBe(3);
    const linkChips = document.querySelectorAll('[data-link-chip]').length;
    expect(linkChips).toBeGreaterThan(0);
    const budget = {
      NodeCard: 320,
      NodeRow: 6 + 8 * linkChips,
      AppInputPanel: 2,
      VariablePanel: 8,
      ConnectorOverlay: 2,
    };
    for (const [id, limit] of Object.entries(budget)) {
      expect(statCount(`render:${id}`), id).toBeLessThanOrEqual(limit);
    }
    expect(statCount('mount:RowDropTarget'), '行の落とし先').toBe(0);
  });

  it('行の落とし先は、出力を掴んでいる間だけ置く', async () => {
    const box = document.querySelector<HTMLElement>('[data-variable-panel] button');
    if (!box) throw new Error('変数ボックスが無い');
    box.focus();
    fireEvent.keyDown(box, { code: 'Space', key: ' ' });
    await settle();
    expect(statCount('mount:RowDropTarget')).toBeGreaterThan(0);

    resetStats();
    fireEvent.keyDown(box, { code: 'Escape', key: 'Escape' });
    await settle();
    expect(statCount('render:RowDropTarget')).toBe(0);
  });

  it('カードはキーボードの ↓ 1 回で 1 段下がる', async () => {
    const before = storedNodeOrder();
    const handle = screen.getAllByRole('button', { name: 'Step を並べ替える' })[0] as Element;
    const press = async (code: string, key: string): Promise<void> => {
      fireEvent.keyDown(handle, { code, key });
      await settle();
    };
    await press('Space', ' ');
    await press('ArrowDown', 'ArrowDown');
    await press('Space', ' ');

    const after = storedNodeOrder();
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
  });
});
