// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resetStats, statCount } from '@/lib/perf-stats';

import { settle, setupChainCanvas, setupFlowCanvas } from '../helpers/flow-canvas';
import { storedNodeOrder } from '../helpers/graph-store';

// ─────────────────────────────
// フロー画面の描き直しの回数（カードの並べ替え・行の落とし先）（組み立ては tests/helpers/flow-canvas.tsx）
// ─────────────────────────────

setupFlowCanvas();

describe('描き直しの回数（カードの並べ替え・行の落とし先）', () => {
  setupChainCanvas();

  // 掴んでいる間、dnd-kit は重ねた先が変わるたびに掴める・落とせる部品を全部描き直す
  // （useDraggable・useDroppable が同じ文脈を読むため）。カードの中身は掴む受け口と分けてあるので、
  // 残るのは中の出力チップの分（重ねた先が変わった回数 × 枚数）。動かした回数には比例しない。
  // 行の落とし先は出力を掴んでいる間だけ置くので、ここでは 1 つも置かない。
  // アプリ入力の列は受け口が別なので、掴んだとき・離したときだけ
  it('カードの並べ替え（キーボードで 3 段下げる）', async () => {
    const handle = screen.getAllByRole('button', { name: 'Step を並べ替える' })[0] as Element;
    const press = async (code: string, key: string): Promise<void> => {
      fireEvent.keyDown(handle, { code, key });
      await settle();
    };
    await press('Space', ' ');
    // 掴んでいる印は描き直さずに要素へ直接付け外しする
    expect(document.querySelector('[data-dragging]')).not.toBeNull();
    // 掴んでいる印が列の外側に付き、列がそれを見てスクロール固定を切る（置き直しとの往復で落ちないように）
    const column = document.querySelector('[data-dragging] [data-flow-scroll]');
    expect(column?.className).toContain('in-data-dragging:[overflow-anchor:none]');
    for (let step = 0; step < 3; step++) await press('ArrowDown', 'ArrowDown');
    await press('Space', ' ');
    expect(document.querySelector('[data-dragging]')).toBeNull();

    expect(storedNodeOrder().indexOf(1)).toBe(3);
    // 行の中身は受け口と分けてあるので、並びが変わったカードの分だけ。
    // カードは、掴んだときと ↓ のたびに重ねた先が変わる（4 回 × 80）。
    // 変数の列は、そのたびに動くカードの位置を追う（4 回 × 2）
    const budget = {
      NodeCard: 320,
      NodeRow: 6,
      AppInputPanel: 2,
      VariablePanel: 8,
      ConnectorOverlay: 2,
    };
    for (const [id, limit] of Object.entries(budget)) {
      expect(statCount(`render:${id}`), id).toBeLessThanOrEqual(limit);
    }
    expect(statCount('mount:RowDropTarget'), '行の落とし先').toBe(0);
  });

  // 行の落とし先は、出力（変数・出力チップ）を掴んだときに置き、離したら外す
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

  // 移動先の候補はカードだけ。カードの中のパラメータ行（リンクの受け口）を候補にすると、
  // 1 回目の ↓ が自分のカードの中の行へ移るだけで、1 段下げるのに 2 回かかる
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
