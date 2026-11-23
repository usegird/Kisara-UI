import { useCallback } from 'react';

import type { InsertTarget } from '@/components/comfy/flow/connector-geometry';
import { orderedNodeIds } from '@/graph/order';
import type { NodeRow } from '@/graph/rows';
import { displayGraph } from '@/graph/subgraph-display';
import type { NodeId } from '@/graph/types';
import type { CardMotion } from '@/hooks/flow/use-flow-motion';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { useGraphStore } from '@/store/use-graph-store';

export interface CardActions {
  readonly insertBetween: (target: InsertTarget) => void;
  readonly deleteNode: (id: NodeId) => void;
  readonly deleteSelected: () => void;
  readonly deleteCards: (ids: readonly NodeId[]) => void;
  readonly cloneCard: (id: NodeId) => void;
  readonly pasteCard: (sources: readonly NodeId[], after: readonly NodeId[]) => void;
  readonly addAfter: (nodeId: NodeId, slot: number, slotType: string) => void;
  readonly addBefore: (nodeId: NodeId, row: NodeRow) => void;
  readonly insertBefore: (nodeId: NodeId) => void;
  readonly append: () => void;
}

export function useCardActions(
  setSearch: NodeEditing['setSearch'],
  motion: CardMotion,
): CardActions {
  const removeNodes = useGraphStore((state) => state.removeNodes);
  const cloneNodes = useGraphStore((state) => state.cloneNodes);
  const { leaveAll: leaveCards, track: trackCard } = motion;

  const insertBetween = (target: InsertTarget): void =>
    setSearch({ kind: 'between', linkIds: target.linkIds, slotType: target.type });
  const deleteCards = useCallback(
    (ids: readonly NodeId[]): void => leaveCards(ids, () => removeNodes(ids)),
    [leaveCards, removeNodes],
  );
  const deleteNode = (id: NodeId): void => {
    const selected = useGraphStore.getState().selectedNodeIds;
    deleteCards(selected.includes(id) ? selected : [id]);
  };
  const deleteSelected = useCallback((): void => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length > 0) deleteCards(selected);
  }, [deleteCards]);
  const cloneCard = (id: NodeId): void => {
    const selected = useGraphStore.getState().selectedNodeIds;
    trackCard(() => cloneNodes(selected.includes(id) ? selected : [id]));
  };
  const pasteCard = useCallback(
    (sources: readonly NodeId[], after: readonly NodeId[]): void => {
      const workflow = useGraphStore.getState().workflow;
      const targets = new Set(after);
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
