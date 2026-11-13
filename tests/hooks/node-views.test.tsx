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

// ─────────────────────────────
// カード表示データの使い回し。並べ替えで番号だけ変わったカードでも、
// 中身が同じ行は前回の行を返す（行とアプリ入力の項目を描き直さないため）。
// ─────────────────────────────

const STEP = definition('Step', [socket('in', 'IMAGE'), widget('value', 'INT')], {
  outputs: [{ name: 'out', type: 'IMAGE' }],
});

beforeEach(() => {
  useDefinitionsStore.setState({ definitions: definitionMap(STEP) });
  // 1 → 2 → 3 の鎖。線で繋がったカードは、並べ替えると番号が変わる
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
    // 並べ替えで作り直されたカードがあること（無ければこのテストは何も確かめていない）
    expect(after.some((view) => view !== before.get(view.id))).toBe(true);
    // 値の行は並べ替えで中身が変わらない（線の行は上流の番号を載せるので変わりうる）
    const valueRow = (view: (typeof after)[number] | undefined): unknown =>
      view?.rows.find((row) => row.name === 'value');
    for (const view of after) {
      expect(valueRow(view), `ノード ${String(view.id)}`).toBe(valueRow(before.get(view.id)));
    }
  });

  // 切り替えごとに前回を分けて持つと、切り替えるたびに全カードが描き直しになる
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

  // 隠す候補は切り替えのたびに作り直される。カードが同じなら並びも同じものを返す
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
  // 前回のカードは id で覚えるので、同じ id のカードに差し替わるまで閉じたタブのカードが残る。
  // 閉じたら残ったタブのカードだけに絞る。回ごとに id を変え、残れば数に出るようにする
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
      // 画面と同じ順（閉じると次のタブで描き直し、それから外れる）
      act(() => {
        useTabsStore.getState().closeTab(tab);
      });
      unmount();
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
