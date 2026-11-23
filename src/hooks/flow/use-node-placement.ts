import type { ConnectSide } from '@/graph/connect-choice';
import { incomingLinkTo } from '@/graph/links';
import { modelInputNames } from '@/graph/model-files';
import type { LinkId, NodeDefinition } from '@/graph/types';
import type { SearchMode } from '@/hooks/flow/use-node-editing';
import { useGraphStore } from '@/store/use-graph-store';
import { modelIndexes, useModelFilesStore } from '@/store/use-model-files-store';

export function useNodePlacement(): (
  definition: NodeDefinition,
  mode: SearchMode,
  newSlot: number | null,
) => void {
  const workflow = useGraphStore((state) => state.workflow);
  const addNode = useGraphStore((state) => state.addNode);
  const insertNodeAt = useGraphStore((state) => state.insertNodeAt);

  const linkFor = (mode: SearchMode): LinkId | null => {
    if (!workflow || mode.kind !== 'before' || mode.slot === null) return null;
    return incomingLinkTo(workflow, mode.nodeId, mode.slot);
  };

  const place = (definition: NodeDefinition, mode: SearchMode, newSlot: number | null): void => {
    const blank = modelInputNames(definition, modelIndexes(useModelFilesStore.getState().folders));
    if (mode.kind === 'append') {
      addNode(definition, mode.anchor, undefined, blank);
      return;
    }
    if (mode.kind === 'between') {
      insertNodeAt(mode.linkIds, definition, { blank });
      return;
    }

    const link = linkFor(mode);
    const side: ConnectSide = mode.kind === 'after' ? 'input' : 'output';

    if (link !== null) {
      const slots =
        newSlot === null ? {} : side === 'input' ? { inputSlot: newSlot } : { outputSlot: newSlot };
      insertNodeAt([link], definition, {
        slots,
        anchor: { nodeId: mode.nodeId, side: mode.kind },
        blank,
      });
      return;
    }

    addNode(
      definition,
      { nodeId: mode.nodeId, side: mode.kind },
      {
        kind: mode.kind,
        nodeId: mode.nodeId,
        slot: mode.slot,
        type: mode.slotType,
        ...(mode.kind === 'before' && mode.widget !== null ? { widget: mode.widget } : {}),
        ...(newSlot === null ? {} : { newSlot }),
      },
      blank,
    );
  };

  return place;
}
