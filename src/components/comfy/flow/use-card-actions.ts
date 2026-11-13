import { useCallback } from 'react';

import type { InsertTarget } from '@/components/comfy/flow/connector-geometry';
import { orderedNodeIds } from '@/graph/order';
import type { NodeRow } from '@/graph/rows';
import { displayGraph } from '@/graph/subgraph-display';
import type { NodeId } from '@/graph/types';
import type { CardMotion } from '@/hooks/flow/use-flow-motion';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// カードに渡す手続き。毎回新しいと全カードが描き直しになるので、ここで揃える
// ─────────────────────────────

/** カードと線から起こす、足す・消す・写す手続き */
export interface CardActions {
  /** 線の真ん中の ⊕。その線の間に挟むノードを、入力・出力とも線の型で探す */
  readonly insertBetween: (target: InsertTarget) => void;
  /**
   * 右クリックの「削除」。確かめずに、右へ抜けてから外す。選んでいるカードなら選択をまとめて
   */
  readonly deleteNode: (id: NodeId) => void;
  /** Delete キー。選んでいるカードをまとめて外す */
  readonly deleteSelected: () => void;
  /**
   * グループごと削除。メンバーをまとめて、右へ抜けてから外す
   */
  readonly deleteCards: (ids: readonly NodeId[]) => void;
  /**
   * 右クリックの「クローン」。選んでいるカードなら選択をまとめて
   */
  readonly cloneCard: (id: NodeId) => void;
  /** Ctrl+V。写したカードのクローンを、`after` の中で並びの最後のカードの後ろへ */
  readonly pasteCard: (sources: readonly NodeId[], after: readonly NodeId[]) => void;
  readonly addAfter: (nodeId: NodeId, slot: number, slotType: string) => void;
  readonly addBefore: (nodeId: NodeId, row: NodeRow) => void;
  readonly insertBefore: (nodeId: NodeId) => void;
  readonly append: () => void;
}

/** カードと線から起こす手続きを作る。選択はどれも押した時点のものを読む */
export function useCardActions(
  setSearch: NodeEditing['setSearch'],
  motion: CardMotion,
): CardActions {
  const removeNodes = useGraphStore((state) => state.removeNodes);
  const cloneNodes = useGraphStore((state) => state.cloneNodes);
  const { leaveAll: leaveCards, track: trackCard } = motion;

  const insertBetween = (target: InsertTarget): void =>
    setSearch({ kind: 'between', linkIds: target.linkIds, slotType: target.type });
  // `deleteSelected` と `pasteCard` はキーと貼り付けの受け口（effect）の依存になる。作り直すと
  // 受け口を付け直すので、compiler に任せず手で固定する（`deleteCards` はその依存）
  const deleteCards = useCallback(
    (ids: readonly NodeId[]): void => leaveCards(ids, () => removeNodes(ids)),
    [leaveCards, removeNodes],
  );
  const deleteNode = (id: NodeId): void => {
    // 押したときの選択だけを読む。押したカードが選択に入っていれば選択全体を消す
    const selected = useGraphStore.getState().selectedNodeIds;
    deleteCards(selected.includes(id) ? selected : [id]);
  };
  const deleteSelected = useCallback((): void => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length > 0) deleteCards(selected);
  }, [deleteCards]);
  const cloneCard = (id: NodeId): void => {
    // 押したときの選択だけを読む。押したカードが選択に入っていれば選択全体を写す
    const selected = useGraphStore.getState().selectedNodeIds;
    trackCard(() => cloneNodes(selected.includes(id) ? selected : [id]));
  };
  const pasteCard = useCallback(
    (sources: readonly NodeId[], after: readonly NodeId[]): void => {
      const workflow = useGraphStore.getState().workflow;
      const targets = new Set(after);
      // 開いた subgraph の中のカードも、見えている並びで探す
      const last = workflow
        ? orderedNodeIds(displayGraph(workflow).workflow).findLast((id) => targets.has(id))
        : undefined;
      if (last === undefined) return;
      trackCard(() => cloneNodes(sources, { nodeId: last, side: 'after' }));
    },
    [trackCard, cloneNodes],
  );
  const addAfter = (nodeId: NodeId, slot: number, slotType: string): void =>
    setSearch({ kind: 'after', nodeId, slot, slotType });
  const addBefore = (nodeId: NodeId, row: NodeRow): void =>
    setSearch({
      kind: 'before',
      nodeId,
      slot: row.inputSlot,
      // パラメータ行は `inputs[]` の位置を持たないので名前で指す
      widget: row.kind === 'widget' ? row.widgetName : null,
      slotType: row.type,
    });
  const insertBefore = (nodeId: NodeId): void =>
    setSearch({ kind: 'append', anchor: { nodeId, side: 'before' } });
  const append = (): void => setSearch({ kind: 'append' });

  return {
    insertBetween,
    deleteNode,
    deleteSelected,
    deleteCards,
    cloneCard,
    pasteCard,
    addAfter,
    addBefore,
    insertBefore,
    append,
  };
}
