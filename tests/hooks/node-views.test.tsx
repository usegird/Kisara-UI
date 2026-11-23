// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorkflowLinkTuple } from '@/graph/types';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { definition, definitionMap, socket, widget } from '../helpers/definitions';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { node } from '../helpers/workflow';

const STEP = definition('Step', [socket('in', 'IMAGE'), widget('value', 'INT')], {
  outputs: [{ name: 'out', type: 'IMAGE' }],
});

beforeEach(() => {
  useDefinitionsStore.setState({ definitions: definitionMap(STEP) });
  const ids = [1, 2, 3];
  useGraphStore.getState().loadWorkflow({
    nodes: ids.map((id) =>
      node(id, 'Step', {
        inputs: [{ name: 'in', type: 'IMAGE', link: id > 1 ? id - 1 : null }],
        outputs: [{ name: 'out', type: 'IMAGE', links: id < 3 ? [id] : [] }],
        widgets_values: [id],
      }),
    ),
    links: ids.slice(0, -1).map((id): WorkflowLinkTuple => [id, id, 0, id + 1, 0, 'IMAGE']),
  });
});

afterEach(() => {
  cleanup();
});

describe('カード表示データの使い回し', () => {
  it('並べ替えで変わったカードでも、中身が同じ行は前回の行を返す', () => {
    const { result, rerender } = renderHook(() => useNodeViews());
    const before = new Map(result.current.map((view) => [view.id, view]));

    useGraphStore.getState().moveNode(1, 2);
    rerender();

    const after = result.current;
    expect(after.some((view) => view !== before.get(view.id))).toBe(true);
    const valueRow = (view: (typeof after)[number] | undefined): unknown =>
      view?.rows.find((row) => row.name === 'value');
    for (const view of after) {
      expect(valueRow(view), `ノード ${String(view.id)}`).toBe(valueRow(before.get(view.id)));
    }
  });

  it('表示の切り替えをまたいでも、中身が同じカードは前回のものを返す', () => {
    const { result, rerender } = renderHook(() => useNodeViews());
    const before = new Map(result.current.map((view) => [view.id, view]));
    const toggle = (): void => {
      act(() => {
        useSettingsStore.setState({
          showUnlinkedNodes: !useSettingsStore.getState().showUnlinkedNodes,
        });
      });
      rerender();
    };

    for (let round = 0; round < 3; round++) {
      toggle();
      for (const view of result.current) {
        expect(view, `${String(round)} 回目・ノード ${String(view.id)}`).toBe(before.get(view.id));
      }
    }
  });

  it('カードが全部同じなら、並び（配列）も前回のものを返す', () => {
    const { result, rerender } = renderHook(() => useNodeViews());
    const before = result.current;

    act(() => {
      useGraphStore.setState({
        hiddenCandidates: new Set(useGraphStore.getState().hiddenCandidates),
      });
    });
    rerender();

    expect(result.current).toBe(before);
  });
});

describe('タブを閉じたとき', () => {
  it('閉じたタブのカードを覚え続けない', async () => {
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round++) {
      const tab = useTabsStore.getState().addTab();
      const ids = [1, 2, 3].map((n) => round * 10 + n);
      act(() => {
        useGraphStore.getState().loadWorkflow({
          nodes: ids.map((id, at) =>
            node(id, 'Step', {
              inputs: [{ name: 'in', type: 'IMAGE', link: at > 0 ? id - 1 : null }],
              outputs: [{ name: 'out', type: 'IMAGE', links: at < 2 ? [id] : [] }],
              widgets_values: [id],
            }),
          ),
          links: ids.slice(0, -1).map((id): WorkflowLinkTuple => [id, id, 0, id + 1, 0, 'IMAGE']),
        });
      });
      const { result, unmount } = renderHook(() => useNodeViews());
      expect(result.current).toHaveLength(3);
      for (const view of result.current) leak.watch(view);
      act(() => {
        useTabsStore.getState().closeTab(tab);
      });
      unmount();
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
