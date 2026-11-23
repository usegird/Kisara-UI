import { motionOf } from '@/components/comfy/flow/item-motion';
import { NO_MEMBERS } from '@/components/comfy/flow/node-list-values';
import { NodeCard, type NodeCardProps } from '@/components/comfy/flow/NodeCard';
import type { LevelListProps } from '@/components/comfy/flow/NodeList';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import type { NodeView } from '@/graph/rows';
import { t } from '@/i18n';

function nodeLabel(view: NodeView): string {
  return t('flow.list.nodeLabel', {
    index: view.index === null ? '' : String(view.index),
    name: view.displayName,
  });
}

function MeasuredCard(props: NodeCardProps): React.ReactElement {
  return <NodeCard {...props} />;
}

export function CardItem({
  view,
  first,
  definitionsLoaded,
  selectedIds,
  cardStates,
  onSelect,
  onCommentChange,
  onCommit,
  onResizeText,
  onNeedOptions,
  onOpenSettings,
  onDelete,
  onClone,
  onGroup,
  onSettingsChange,
  onDisconnect,
  onAddAfter,
  onAddBefore,
  onToggleAppInput,
  onToggleCollapsed,
  onInsertBefore,
  enteringId = null,
  leavingIds = NO_MEMBERS,
  onMotionEnd,
  level,
  openSubgraph,
  closeSubgraph,
  subgraphUses,
  onConvertSubgraph,
}: LevelListProps & {
  readonly view: NodeView;
  readonly first: boolean;
  readonly subgraphUses?: number | undefined;
}): React.ReactElement {
  const selected = selectedIds.has(view.id);
  const inner = level !== null;
  return (
    <ErrorBoundary
      label={nodeLabel(view)}
      resetKey={view}
      fallback={(error, retry) => (
        <li>
          <BrokenNotice
            label={nodeLabel(view)}
            error={error}
            onRetry={retry}
            extra={
              <button
                type="button"
                className={FALLBACK_BUTTON_CLASS}
                onClick={() => onDelete(view.id)}
              >
                {t('flow.shared.deleteNode')}
              </button>
            }
          />
        </li>
      )}
    >
      <MeasuredCard
        view={view}
        state={cardStates.get(view.id) ?? (selected ? 'selected' : 'idle')}
        selected={selected}
        definitionsLoaded={definitionsLoaded}
        onSelect={onSelect}
        onCommentChange={onCommentChange}
        onCommit={onCommit}
        onResizeText={onResizeText}
        onNeedOptions={onNeedOptions}
        onOpenSettings={onOpenSettings}
        onDelete={onDelete}
        onClone={onClone}
        onGroup={onGroup}
        onSettingsChange={onSettingsChange}
        onDisconnect={onDisconnect}
        onAddAfter={onAddAfter}
        onAddBefore={onAddBefore}
        onToggleAppInput={inner ? undefined : onToggleAppInput}
        onToggleCollapsed={onToggleCollapsed}
        onOpenSubgraph={inner ? undefined : openSubgraph}
        onConvertSubgraph={inner ? undefined : onConvertSubgraph}
        subgraphOpen={subgraphUses !== undefined}
        onCloseSubgraph={closeSubgraph}
        subgraphUses={subgraphUses}
        onInsertAbove={onInsertBefore}
        insertAt={first ? 'edge' : 'gap'}
        motion={motionOf(leavingIds.includes(view.id), view.id === enteringId)}
        onMotionEnd={onMotionEnd}
      />
    </ErrorBoundary>
  );
}
