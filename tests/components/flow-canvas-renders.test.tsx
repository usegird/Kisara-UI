// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resetStats, statCount } from '@/lib/perf-stats';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';

import {
  CHAIN_LENGTH,
  expectWithinBudget,
  FOLLOW,
  setCardScrollShift,
  settle,
  setupChainCanvas,
  setupFlowCanvas,
  STEP,
  STILL,
} from '../helpers/flow-canvas';

// ─────────────────────────────
// フロー画面の描き直しの回数（値の編集・選択・実行の進捗）（組み立ては tests/helpers/flow-canvas.tsx）
// ─────────────────────────────

setupFlowCanvas();

describe('描き直しの回数（値の編集・選択・実行の進捗）', () => {
  setupChainCanvas();

  it.each([
    [
      '先頭の値の編集（下流の全カードに載る）',
      CHAIN_LENGTH,
      FOLLOW,
      () => useGraphStore.getState().setWidgetValue(1, STEP, 'value', 5),
    ],
    [
      '末尾の値の編集',
      1,
      FOLLOW,
      () => useGraphStore.getState().setWidgetValue(CHAIN_LENGTH, STEP, 'value', 5),
    ],
    ['カードの選択', 1, STILL, () => useGraphStore.getState().select(1)],
    [
      // 位置は線と変数の列だけが使う。カードは位置が変わっても描き直さない
      'カードの列のスクロール',
      0,
      FOLLOW,
      () => {
        setCardScrollShift(120);
        const column = document.querySelector('[data-flow-scroll]');
        if (!column) throw new Error('カードの列が無い');
        fireEvent.scroll(column);
      },
    ],
    ['実行の進捗', 1, STILL, () => useExecutionStore.setState({ nodeStates: { '1': 'running' } })],
  ])('%s', async (_, cards, panels, operate) => {
    act(() => {
      operate();
    });
    await settle();
    expectWithinBudget(cards, panels);
  });

  // 進捗の通知はノードの状態を作り直すが、カードの状態が変わらなければ何も描き直さない
  it('実行の進捗（カードの状態が変わらない通知）', async () => {
    act(() => {
      useExecutionStore.setState({ nodeStates: { '1': 'running' } });
    });
    await settle();
    resetStats();

    act(() => {
      useExecutionStore.setState({
        nodeStates: { '1': 'running' },
        progress: { value: 3, max: 10 },
      });
    });
    await settle();

    for (const id of [
      'NodeCard',
      'NodeRow',
      'VariablePanel',
      'ConnectorOverlay',
      'AppInputPanel',
    ]) {
      expect(statCount(`render:${id}`), id).toBe(0);
    }
  });
});
