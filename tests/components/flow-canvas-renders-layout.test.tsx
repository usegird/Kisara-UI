// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appInputOrder } from '@/graph/app-input-order';
import { resetStats, statCount } from '@/lib/perf-stats';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { settle, settleMeasuring, setupChainCanvas, setupFlowCanvas } from '../helpers/flow-canvas';

setupFlowCanvas();

describe('描き直しの回数（列の幅・スクロール・表示の切り替え・アプリ入力の並べ替え）', () => {
  setupChainCanvas();

  it('右の列の幅を変えても、本体の列は描き直さない', async () => {
    act(() => {
      useSettingsStore.getState().resizeColumn('queue', 16);
    });
    await settle();

    for (const id of ['FlowCanvas', 'NodeCard', 'VariablePanel', 'ConnectorOverlay']) {
      expect(statCount(`render:${id}`), id).toBe(0);
    }
  });

  it('列の外のスクロールでは測り直さない', async () => {
    const outside = document.createElement('div');
    document.body.append(outside);

    act(() => {
      fireEvent.scroll(outside);
    });
    await settleMeasuring();
    expect(statCount('measure:anchors')).toBe(0);

    act(() => {
      const column = document.querySelector('[data-flow-scroll]');
      if (!column) throw new Error('カードの列が無い');
      fireEvent.scroll(column);
    });
    await settleMeasuring();
    expect(statCount('measure:anchors')).toBe(1);

    outside.remove();
  });

  it('表示の切り替え（隠すものが無いとき）', async () => {
    const initial = useSettingsStore.getState().showUnlinkedNodes;
    for (let round = 0; round < 2; round++) {
      act(() => {
        useSettingsStore.setState({
          showUnlinkedNodes: !useSettingsStore.getState().showUnlinkedNodes,
        });
      });
      await settle();
    }
    expect(useSettingsStore.getState().showUnlinkedNodes).toBe(initial);
    for (const id of ['NodeCard', 'NodeRow', 'VariablePanel', 'ConnectorOverlay']) {
      expect(statCount(`render:${id}`), id).toBe(0);
    }
  });

  it('アプリ入力の並べ替え（キーボードで 2 段下げる）', async () => {
    for (const id of [1, 2, 3]) useGraphStore.getState().toggleAppInput(id, 'value');
    await settle();
    await settle();
    resetStats();

    const handle = screen.getAllByRole('button', { name: 'value を並べ替える' })[0] as Element;
    const press = async (code: string, key: string): Promise<void> => {
      fireEvent.keyDown(handle, { code, key });
      await settle();
    };
    await press('Space', ' ');
    for (let step = 0; step < 2; step++) await press('ArrowDown', 'ArrowDown');
    await press('Space', ' ');

    expect(appInputOrder(useGraphStore.getState().workflow!)[0]?.nodeId).not.toBe(1);
    const budget = { NodeCard: 0, AppField: 2, VariablePanel: 1, ConnectorOverlay: 1 };
    for (const [id, limit] of Object.entries(budget)) {
      expect(statCount(`render:${id}`), id).toBeLessThanOrEqual(limit);
    }
  });
});
