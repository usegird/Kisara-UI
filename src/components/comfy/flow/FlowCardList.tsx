import type { DragPreview } from '@/components/comfy/flow/card-outline';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { NodeList } from '@/components/comfy/flow/NodeList';
import type { CardActions } from '@/components/comfy/flow/use-card-actions';
import type { NodeView } from '@/graph/rows';
import type { DisplayGraph } from '@/graph/subgraph-display';
import type { NodeId } from '@/graph/types';
import type { CardGroups } from '@/hooks/flow/use-card-groups';
import type { CardMotion } from '@/hooks/flow/use-flow-motion';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { useGraphStore } from '@/store/use-graph-store';

interface FlowCardListProps {
  readonly views: readonly NodeView[];
  readonly definitionsLoaded: boolean;
  readonly cardGroups: CardGroups;
  readonly preview: DragPreview | null;
  readonly cardStates: ReadonlyMap<NodeId, NodeCardState>;
  readonly onCommit: NodeEditing['commitValue'];
  readonly onResizeText: NodeEditing['resizeText'];
  readonly onNeedOptions: NodeEditing['needOptions'];
  readonly onOpenSettings: NodeEditing['setSettingsFor'] | undefined;
  readonly actions: CardActions;
  readonly motion: CardMotion;
  readonly onToggleAppInput: (nodeId: NodeId, widgetName: string) => void;
  readonly frames: DisplayGraph['frames'] | undefined;
}

export function FlowCardList({
  views,
  definitionsLoaded,
  cardGroups,
  preview,
  cardStates,
  onCommit,
  onResizeText,
  onNeedOptions,
  onOpenSettings,
  actions,
  motion,
  onToggleAppInput,
  frames,
}: FlowCardListProps): React.ReactElement {
  const select = useGraphStore((state) => state.select);
  const renameGroup = useGraphStore((state) => state.renameGroup);
  const ungroup = useGraphStore((state) => state.ungroup);
  const setGroupColor = useGraphStore((state) => state.setGroupColor);
  const setTitle = useGraphStore((state) => state.setTitle);
  const updateNodeSettings = useGraphStore((state) => state.updateNodeSettings);
  const disconnect = useGraphStore((state) => state.disconnect);
  const toggleCollapsed = useGraphStore((state) => state.toggleCollapsed);
  const setSubgraphOpen = useGraphStore((state) => state.setSubgraphOpen);
  const convertGroupToSubgraph = useGraphStore((state) => state.convertGroupToSubgraph);
  const convertSubgraphToGroup = useGraphStore((state) => state.convertSubgraphToGroup);

  return (
    <NodeList
      views={views}
      definitionsLoaded={definitionsLoaded}
      selectedIds={cardGroups.selectedIds}
      groupOf={cardGroups.groupOf}
      groupParents={cardGroups.groupParents}
      groupLabels={cardGroups.groupLabels}
      onGroup={cardGroups.group}
      onRenameGroup={renameGroup}
      onUngroup={ungroup}
      onDeleteCards={actions.deleteCards}
      onConvertGroup={convertGroupToSubgraph}
      onConvertSubgraph={convertSubgraphToGroup}
      onGroupColorChange={setGroupColor}
      preview={preview}
      cardStates={cardStates}
      onSelect={select}
      onCommentChange={setTitle}
      onCommit={onCommit}
      onResizeText={onResizeText}
      onNeedOptions={onNeedOptions}
      onOpenSettings={onOpenSettings}
      onDelete={actions.deleteNode}
      onClone={actions.cloneCard}
      enteringId={motion.entering}
      leavingIds={motion.leavingKeys}
      onMotionEnd={motion.finish}
      onSettingsChange={updateNodeSettings}
      onDisconnect={disconnect}
      onToggleAppInput={onToggleAppInput}
      onAddAfter={actions.addAfter}
      onAddBefore={actions.addBefore}
      onToggleCollapsed={toggleCollapsed}
      frames={frames}
      onSetSubgraphOpen={setSubgraphOpen}
      onAppend={actions.append}
      onInsertBefore={actions.insertBefore}
    />
  );
}
