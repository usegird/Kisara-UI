import type { StoreApi } from 'zustand';

import { dropLinkedAppInputs } from '@/graph/app-inputs';
import { unpinMoved } from '@/graph/node-flags';
import { settleLayout } from '@/graph/order';
import { unlinkedDisplayIds } from '@/graph/subgraph-display';
import type { NodeId, Workflow } from '@/graph/types';
import type { GraphHistory, GraphState } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの slice が共有する載せ方（ピン留めを外して載せる・取り消しの控えに積む）と空の値。
// ─────────────────────────────

/** 控える手の上限。古いものから捨てる */
const HISTORY_LIMIT = 50;

/** 控えの無い状態（毎回同じものを使う） */
export const EMPTY_HISTORY: GraphHistory = { past: [], future: [] };

/** 何も選んでいないとき（毎回同じ配列を使い、空どうしの置き換えで描き直さない） */
export const NO_SELECTION: readonly NodeId[] = [];

/** 置いたときに空にする入力の指定が無いとき（何も空にしない） */
export const BLANK_NONE: ReadonlySet<string> = new Set();

/**
 * 取り消しで戻す先の 1 手。ワークフローと、そのときの選択・隠す相手
 */
export interface GraphMoment {
  readonly workflow: Workflow;
  readonly selectedNodeIds: readonly NodeId[];
  readonly hiddenCandidates: ReadonlySet<NodeId>;
}

/** 編集の結果を載せる形（`update` の戻り値） */
type UpdatePatch = Pick<GraphState, 'workflow' | 'dirty' | 'hiddenCandidates'>;

/** slice が使う載せ方 */
interface GraphKit {
  /**
   * 編集の結果を載せる。位置を変えたノードのピン留めを外す。
   * 読み込み・取り消し・やり直し・戻すは素の set（別の時点の形をそのまま載せる）
   */
  readonly set: (patch: Partial<GraphState>) => void;
  /** 編集の結果を載せる形にする（`update` に今の隠す相手を渡す） */
  readonly apply: (workflow: Workflow, next: Workflow) => UpdatePatch;
  /**
   * カードを足す・消す操作の結果を載せ、直前を取り消しの控えに積む。
   * 何も変わらなければ積まない。やり直しの控えは捨てる
   */
  readonly record: (
    workflow: Workflow,
    patch: Pick<GraphState, 'workflow'> & Partial<GraphState>,
  ) => void;
}

/** ストアの set と get から、slice が使う載せ方を作る */
export function createGraphKit(
  rawSet: StoreApi<GraphState>['setState'],
  get: () => GraphState,
): GraphKit {
  const set = (patch: Partial<GraphState>): void => {
    const before = get().workflow;
    const after = patch.workflow;
    if (before && after && after !== before) {
      rawSet({ ...patch, workflow: unpinMoved(before, after) });
      return;
    }
    rawSet(patch);
  };
  const apply = (workflow: Workflow, next: Workflow): UpdatePatch =>
    update(get().hiddenCandidates, workflow, next);
  const record: GraphKit['record'] = (workflow, patch) => {
    if (patch.workflow === workflow) return;
    const state = get();
    const past = [...state.history.past, momentOf(state, workflow)].slice(-HISTORY_LIMIT);
    set({ ...patch, history: { past, future: [] } });
  };
  return { set, apply, record };
}

/** 今の 1 手（取り消しの控えに積む形） */
export function momentOf(state: GraphState, workflow: Workflow): GraphMoment {
  return {
    workflow,
    selectedNodeIds: state.selectedNodeIds,
    hiddenCandidates: state.hiddenCandidates,
  };
}

/**
 * 外したものを除いた選択。何も外れなければ元の配列、空になれば `NO_SELECTION`
 * （同じ物を返し、選択の購読を描き直させない）
 */
export function keptSelection(
  selected: readonly NodeId[],
  kept: readonly NodeId[],
): readonly NodeId[] {
  if (kept.length === selected.length) return selected;
  return kept.length > 0 ? kept : NO_SELECTION;
}

/**
 * 編集の結果を載せる。結線・挿入・ノードの追加など、線を変える操作はどれもここを通る。
 *   ・結線されたパラメータはアプリ入力から外す
 *   ・大きさ・折りたたみが伸びたら、伸びた分だけ送る。
 *     線・値の変更では動かさない（足したもの・消したものは操作の側で置いてある）
 *   ・線が付いたノードは隠す相手から外す。**線の付け外しでは隠れない**
 */
function update(candidates: ReadonlySet<NodeId>, workflow: Workflow, next: Workflow): UpdatePatch {
  if (next === workflow) return { workflow, dirty: false, hiddenCandidates: candidates };

  const settled = dropLinkedAppInputs(settleLayout(workflow, next));
  const unlinked = unlinkedDisplayIds(settled);
  const kept = [...candidates].filter((id) => unlinked.has(id));
  return {
    workflow: settled,
    dirty: true,
    hiddenCandidates: kept.length === candidates.size ? candidates : new Set(kept),
  };
}
