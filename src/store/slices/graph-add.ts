import type { StateCreator } from 'zustand';

import { lastNodeId, placeNewNode, placeNewNodes } from '@/graph/add-placement';
import { cloneNodes } from '@/graph/clone-nodes';
import { createNode, withNewNode } from '@/graph/create-node';
import { inLevel, levelOfTargets } from '@/graph/level-edit';
import { linkIndex } from '@/graph/link-read';
import {
  insertNodeAcross,
  insertNodeBetween,
  linkNewNode,
  type InsertNodeOptions,
} from '@/graph/links';
import { insertAfterX, orderedNodeIds, type PlacementAnchor } from '@/graph/order';
import { inputSlotFor, outputSlotFor } from '@/graph/slot-types';
import type { LinkId, NodeDefinition, NodeId, Workflow } from '@/graph/types';
import { nextNodeId } from '@/graph/workflow-ids';
import { BLANK_NONE, createGraphKit } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの、ノードを足す操作（定義から足す・線の間に挟む・クローン）。どれも取り消しの 1 手。
// ─────────────────────────────

/** この slice が持つ操作 */
type GraphAddActions = Pick<
  GraphState,
  'addNode' | 'insertNodeAt' | 'appendNode' | 'insertNode' | 'cloneNode' | 'cloneNodes'
>;

/** 線の間に挟むノードの指定 */
interface InsertRequest {
  readonly linkIds: readonly LinkId[];
  readonly firstId: LinkId;
  readonly definition: NodeDefinition;
  readonly slots: InsertNodeOptions;
  readonly anchor: PlacementAnchor | undefined;
  readonly blank: ReadonlySet<string>;
}

/** ノードを足す操作を作る */
export const createGraphAddSlice: StateCreator<GraphState, [], [], GraphAddActions> = (
  rawSet,
  get,
) => {
  const { apply, record } = createGraphKit(rawSet, get);
  return {
    addNode: (definition, anchor, connect, blank = BLANK_NONE) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const level = levelOfTargets([anchor?.nodeId, connect?.nodeId]);
      const next = inLevel(workflow, level, (target) => {
        const node = createNode(definition, nextNodeId(target), [0, 0], blank);
        // **線の有無で置き方が変わるので、繋いでから置く**
        const added = withNewNode(target, node);
        const linked = connect ? linkNewNode(added, node, connect) : added;
        return placeNewNode(linked, node.id, anchor, undefined);
      });
      record(workflow, apply(workflow, next));
    },

    insertNodeAt: (linkIds, definition, { slots = {}, anchor, blank = BLANK_NONE } = {}) => {
      const workflow = get().workflow;
      const firstId = linkIds[0];
      if (!workflow || firstId === undefined) return;

      const request = { linkIds, firstId, definition, slots, anchor, blank };
      const level = levelOfTargets([...linkIds, anchor?.nodeId]);
      const next = inLevel(workflow, level, (target) => insertAcrossLinks(target, request));
      record(workflow, apply(workflow, next));
    },

    appendNode: (node) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = withNewNode(workflow, node);
      if (next === workflow) return;

      record(workflow, {
        workflow: insertAfterX(next, node.id, lastNodeId(workflow)),
        dirty: true,
      });
    },

    insertNode: (linkId, node) => {
      const workflow = get().workflow;
      if (!workflow) return;
      const origin = linkIndex(workflow.links).get(linkId)?.originId;
      const inserted = insertNodeBetween(workflow, linkId, node);
      record(
        workflow,
        apply(workflow, insertAfterX(inserted, node.id, origin ?? lastNodeId(workflow))),
      );
    },

    cloneNode: (nodeId, at) => get().cloneNodes([nodeId], at),

    cloneNodes: (nodeIds, at) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = inLevel(workflow, levelOfTargets([...nodeIds, at?.nodeId]), (level) =>
        cloneInLevel(level, nodeIds, at),
      );
      record(workflow, apply(workflow, next));
    },
  };
};

/** 階層の中で、線の間に新しいノードを挟んで置く。階層をまたぐ線があれば元の階層 */
function insertAcrossLinks(target: Workflow, request: InsertRequest): Workflow {
  const { linkIds, slots } = request;
  const placed = createNode(request.definition, nextNodeId(target), [0, 0], request.blank);
  // 入力元（リンクの出力側）の右隣を空けてそこに置く
  const index = linkIndex(target.links);
  const link = index.get(request.firstId);
  // 入口・出口の線には挟まない（階層をまたぐ）
  const crossing = linkIds.some((id) => {
    const candidate = index.get(id);
    return candidate !== undefined && (candidate.originId < 0 || candidate.targetId < 0);
  });
  if (crossing) return target;

  // **型の合うスロット**に繋ぐ（先頭に決め打ちすると別の型へ繋がる）。
  // 選んでもらった口があればそれを優先する
  const type = link?.type ?? '*';
  const inputSlot = slots.inputSlot ?? inputSlotFor(placed, type);
  const outputSlot = slots.outputSlot ?? outputSlotFor(placed, type);

  const inserted = insertNodeAcross(target, linkIds, placed, {
    ...(inputSlot === null ? {} : { inputSlot }),
    ...(outputSlot === null ? {} : { outputSlot }),
  });
  return placeNewNode(inserted, placed.id, request.anchor, link?.originId);
}

/** 階層の中で、選んだノードを元の表示順のまま写して置く。写せなければ元の階層 */
function cloneInLevel(
  level: Workflow,
  nodeIds: readonly NodeId[],
  at: PlacementAnchor | undefined,
): Workflow {
  // 元の表示順に写す（選んだ順ではなく、並んでいる順のまま足す）
  const chosen = new Set(nodeIds);
  const ordered = orderedNodeIds(level).filter((id) => chosen.has(id));
  const last = ordered.at(-1);
  const cloned = cloneNodes(level, ordered);
  if (!cloned || last === undefined) return level;
  // 既定は元の中で最後のノードのすぐ後ろ（下）。線の有無で置き方が変わるので、繋いでから置く
  const anchor = at ?? { nodeId: last, side: 'after' };
  return placeNewNodes(cloned.workflow, cloned.ids, anchor, undefined);
}
