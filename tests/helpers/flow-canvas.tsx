import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect } from 'vitest';

import { FlowCanvas } from '@/components/comfy/flow/FlowCanvas';
import type { WorkflowLinkTuple, WorkflowNode } from '@/graph/types';
import { resetStats, statCount } from '@/lib/perf-stats';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';

import { definition, definitionMap, socket, widget } from './definitions';
import { stubMissingDom } from './dom';
import { loadDefinitions } from './fixtures';
import { node } from './workflow';

// ─────────────────────────────
// フロー画面（FlowCanvas）のテストの共通の組み立て。画面の部分ごとのテストのファイルがここから使う。
// 測定の仕組みの配線を確かめるため、jsdom に要素ごとに異なる矩形を返すスタブを入れる。
// ─────────────────────────────

// 座標そのものの正しさはブラウザでの目視に委ねる。
// 1 本のファイルにまとめると、並べて走らせられずテスト全体の時間を引っ張るので、部分ごとに分ける

/** カードの列を送った量。列の中の要素だけ、その分だけ上へずらして返す */
let cardScrollShift = 0;

/** カードの列を送った量を決める（列の中の要素の矩形がその分だけ上へずれる） */
export function setCardScrollShift(shift: number): void {
  cardScrollShift = shift;
}

/** カードの列の中身なら、送った分だけずらす（列そのものは動かない） */
function shifted(element: Element, rect: DOMRect): DOMRect {
  if (cardScrollShift === 0 || element.hasAttribute('data-flow-scroll')) return rect;
  if (element.closest('[data-flow-scroll]') === null) return rect;
  const top = rect.top - cardScrollShift;
  return { ...rect, y: top, top, bottom: top + rect.height, toJSON: () => ({}) };
}

function stubRects(): void {
  stubMissingDom();

  let counter = 0;
  const rects = new WeakMap<Element, DOMRect>();
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    const cached = rects.get(this);
    if (cached) return shifted(this, cached);

    // 変数パネルとカード列は「見えている範囲」なので、全体を覆う矩形にしておく
    if (
      this instanceof Element &&
      (this.hasAttribute('data-variable-panel') ||
        this.hasAttribute('data-flow-scroll') ||
        this.hasAttribute('data-app-scroll'))
    ) {
      const panel = {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 300,
        height: 100000,
        right: 300,
        bottom: 100000,
        toJSON: () => ({}),
      } as DOMRect;
      rects.set(this, panel);
      return panel;
    }

    counter += 1;
    const rect = {
      x: counter * 10,
      y: counter * 20,
      left: counter * 10,
      top: counter * 20,
      width: 100,
      height: 30,
      right: counter * 10 + 100,
      bottom: counter * 20 + 30,
      toJSON: () => ({}),
    } as DOMRect;
    rects.set(this, rect);
    return shifted(this, rect);
  };
}

/** フロー画面のテストのファイルの先頭で呼ぶ。矩形のスタブ・グラフと定義の初期化・後始末 */
export function setupFlowCanvas(): void {
  beforeAll(stubRects);
  beforeEach(() => {
    useGraphStore.getState().clear();
    useDefinitionsStore.setState({ definitions: loadDefinitions() });
  });
  afterEach(() => {
    cleanup();
  });
}

/** 測り直し・線の引き直しまで待つ */
export async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

// ─────────────────────────────
// 描き直しの回数。重い経路の回数に上限を置き、増えたら落とす。30〜50 ノード規模の鎖で測る。
// 超えたら描き直しの原因を探してから見直す（減らせたら上限も下げる）
// ─────────────────────────────

/** 鎖のノードの数 */
export const CHAIN_LENGTH = 40;
/** 鎖の 1 ノードの定義（IMAGE の入出力と INT の widget） */
export const STEP = definition('Step', [socket('in', 'IMAGE'), widget('value', 'INT')], {
  outputs: [{ name: 'out', type: 'IMAGE' }],
});

/** 1 → 2 → … と IMAGE で繋いだ鎖。どのノードも INT の widget を 1 つ持つ */
function chainWorkflow(): { nodes: WorkflowNode[]; links: WorkflowLinkTuple[] } {
  const ids = Array.from({ length: CHAIN_LENGTH }, (_, index) => index + 1);
  const nodes = ids.map((id) =>
    node(id, 'Step', {
      inputs: [{ name: 'in', type: 'IMAGE', link: id > 1 ? id - 1 : null }],
      outputs: [{ name: 'out', type: 'IMAGE', links: id < CHAIN_LENGTH ? [id] : [] }],
      widgets_values: [0],
    }),
  );
  const links = ids.slice(0, -1).map((id): WorkflowLinkTuple => [id, id, 0, id + 1, 0, 'IMAGE']);
  return { nodes, links };
}

/**
 * 測り直しが止まるまで待つ。測った結果で線・変数の箱が描き直され、それがまた測る予約を入れるので、
 * 1 回待つだけでは負荷が高いと予約が待ちの後に流れる（数え直しの後に 1 回数えてしまう）。
 * 予約は遅くとも 100ms のタイマーで流れる（use-anchor-registry）。それより長く待ち、
 * その間に 1 回も測らなければ、待つ前に入っていた予約は無い
 */
export async function settleMeasuring(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const before = statCount('measure:anchors');
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    if (statCount('measure:anchors') === before) return;
  }
  throw new Error('測り直しが止まらない');
}

/** 描き直しの回数のテストの describe の中で呼ぶ。40 ノードの鎖を描き、測り終えてから数え始める */
export function setupChainCanvas(): void {
  beforeEach(async () => {
    useDefinitionsStore.setState({ definitions: definitionMap(STEP) });
    useExecutionStore.getState().reset();
    useGraphStore.getState().loadWorkflow(chainWorkflow());
    cardScrollShift = 0;
    render(<FlowCanvas />);
    await settleMeasuring();
    resetStats();
  });

  afterEach(() => {
    cardScrollShift = 0;
  });
}
// カードは中身か受け取り物が変わったものだけ描き直す。
// 鎖の先頭の値は下流の全カードに「上流から引き継いだ値」として載るので、先頭の編集は全カード。
// 下流の無い末尾の編集・選択・実行の進捗は 1 枚だけ。
// 列と線は、値か位置が変わったときだけ描き直す（選択・実行の進捗では描き直さない）
export const FOLLOW = { VariablePanel: 1, ConnectorOverlay: 1, AppInputPanel: 0 };
export const STILL = { VariablePanel: 0, ConnectorOverlay: 0, AppInputPanel: 0 };

export function expectWithinBudget(cards: number, panels: Record<string, number>): void {
  // 数え漏れで素通りしないよう、台帳に届いていることも確かめる
  // （カードを描き直さない操作では、位置に追従する線で確かめる）
  const probe = cards > 0 ? 'NodeCard' : 'ConnectorOverlay';
  expect(statCount(`render:${probe}`), '台帳に届いていない').toBeGreaterThan(0);
  for (const [id, limit] of Object.entries({ NodeCard: cards, ...panels })) {
    expect(statCount(`render:${id}`), id).toBeLessThanOrEqual(limit);
  }
}
