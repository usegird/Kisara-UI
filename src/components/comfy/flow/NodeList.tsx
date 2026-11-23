import { SortableContext } from '@dnd-kit/sortable';
import { Fragment, useState } from 'react';

import { AddNodeButton } from '@/components/comfy/flow/AddNodeButton';
import {
  entryCardIds,
  entryKey,
  entrySortId,
  withPreview,
  type DragPreview,
  type OutlineEntry,
} from '@/components/comfy/flow/card-outline';
import { CardGroupFrame } from '@/components/comfy/flow/CardGroupFrame';
import {
  groupSortId,
  keepInPlace,
  sortLevelOf,
  subgraphContainerId,
} from '@/components/comfy/flow/flow-dnd';
import {
  CARD_COLUMN_PADDING,
  CARD_COLUMN_PADDING_LEFT,
} from '@/components/comfy/flow/group-frame-look';
import { NO_MEMBERS } from '@/components/comfy/flow/node-list-values';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { CardItem } from '@/components/comfy/flow/NodeListCardItem';
import { SubgraphBranch } from '@/components/comfy/flow/SubgraphBranch';
import {
  groupLabelOf,
  segmentByGroup,
  type CardSegment,
  type GroupLabel,
  type GroupParents,
  type Membership,
} from '@/graph/groups';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { NodeRow, NodeView } from '@/graph/rows';
import type { SubgraphFrame as SubgraphFrameData } from '@/graph/subgraph-display';
import { levelOfId } from '@/graph/subgraph-level';
import type { LinkId, NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { reuseEqualItems, sameContent } from '@/lib/reuse-equal';

export interface NodeListProps {
  readonly views: readonly NodeView[];
  readonly definitionsLoaded?: boolean | undefined;
  readonly selectedIds: ReadonlySet<NodeId>;
  readonly groupOf: Membership;
  readonly groupParents: GroupParents;
  readonly groupLabels: readonly GroupLabel[];
  readonly cardStates: ReadonlyMap<NodeId, NodeCardState>;
  readonly onSelect: (id: NodeId, additive?: boolean) => void;
  readonly onCommentChange: (id: NodeId, comment: string) => void;
  readonly onCommit: (row: NodeRow, value: unknown) => void;
  readonly onResizeText: (row: NodeRow, height: number) => void;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onOpenSettings?: ((id: NodeId) => void) | undefined;
  readonly onDelete: (id: NodeId) => void;
  readonly onClone: (id: NodeId) => void;
  readonly onGroup: (id: NodeId) => void;
  readonly onRenameGroup: (key: string, title: string) => void;
  readonly onUngroup: (key: string) => void;
  readonly onGroupColorChange: (key: string, color: string | null) => void;
  readonly preview?: DragPreview | null | undefined;
  readonly onSettingsChange: (id: NodeId, patch: NodeSettingsPatch) => void;
  readonly onDisconnect: (linkId: LinkId) => void;
  readonly onAddAfter: (id: NodeId, slot: number, type: string) => void;
  readonly onAddBefore: (id: NodeId, row: NodeRow) => void;
  readonly onToggleAppInput: (id: NodeId, widgetName: string) => void;
  readonly onToggleCollapsed: (id: NodeId) => void;
  readonly onAppend: () => void;
  readonly frames?: ReadonlyMap<NodeId, SubgraphFrameData> | undefined;
  readonly onDeleteCards?: ((ids: readonly NodeId[]) => void) | undefined;
  readonly onConvertGroup?: ((key: string) => void) | undefined;
  readonly onConvertSubgraph?: ((id: NodeId) => void) | undefined;
  readonly onSetSubgraphOpen?: ((id: NodeId, open: boolean) => void) | undefined;
  readonly onInsertBefore: (id: NodeId) => void;
  readonly enteringId?: NodeId | null | undefined;
  readonly leavingIds?: readonly NodeId[] | undefined;
  readonly onMotionEnd?: ((id: NodeId) => void) | undefined;
}

function outlineOf(
  segments: readonly CardSegment<NodeView>[],
  labels: readonly GroupLabel[],
): OutlineEntry[] {
  return segments.map((segment): OutlineEntry => {
    if (segment.kind === 'single') return { kind: 'card', id: segment.item.id };
    const label = groupLabelOf(labels, segment.index);
    return { kind: 'group', label, entries: outlineOf(segment.children, labels) };
  });
}

function useOutline(
  views: readonly NodeView[],
  groupOf: Membership,
  parents: GroupParents,
  labels: readonly GroupLabel[],
): readonly OutlineEntry[] {
  const next = outlineOf(segmentByGroup(views, groupOf, parents), labels);
  const [kept, setKept] = useState<readonly OutlineEntry[]>(next);
  if (sameContent(kept, next)) return kept;
  const reused = reuseEqualItems(kept, next, entryKey);
  setKept(reused);
  return reused;
}

const NO_ITEMS: readonly (NodeId | string)[] = [];

interface FrameLists {
  readonly items: readonly (NodeId | string)[];
  readonly members: readonly NodeId[];
}

function frameListsOf(entries: readonly OutlineEntry[], into: Map<string, FrameLists>): void {
  for (const entry of entries) {
    if (entry.kind === 'card') continue;
    into.set(entry.label.key, {
      items: entry.entries.map(entrySortId),
      members: entryCardIds(entry),
    });
    frameListsOf(entry.entries, into);
  }
}

const NO_FRAMES: ReadonlyMap<NodeId, SubgraphFrameData> = new Map();
const NO_VIEWS: readonly NodeView[] = [];

function splitByLevel(views: readonly NodeView[]): {
  readonly outer: readonly NodeView[];
  readonly inner: ReadonlyMap<NodeId, readonly NodeView[]>;
} {
  const outer: NodeView[] = [];
  const inner = new Map<NodeId, NodeView[]>();
  for (const view of views) {
    const level = levelOfId(view.id);
    if (level === null) outer.push(view);
    else inner.set(level, [...(inner.get(level) ?? []), view]);
  }
  return { outer, inner };
}

function previewLevel(preview: DragPreview): NodeId | null {
  return sortLevelOf(typeof preview.id === 'number' ? preview.id : groupSortId(preview.id.group));
}

export function NodeList(props: NodeListProps): React.ReactElement {
  const { views, groupOf, groupLabels, onAppend, onSetSubgraphOpen } = props;
  const levels = splitByLevel(views);
  const openSubgraph = (id: NodeId): void => onSetSubgraphOpen?.(id, true);
  const closeSubgraph = (id: NodeId): void => onSetSubgraphOpen?.(id, false);
  const pad = CARD_COLUMN_PADDING;
  const padLeft = CARD_COLUMN_PADDING_LEFT;

  return (
    <div style={{ paddingLeft: padLeft, paddingRight: pad }}>
      <LevelList
        {...props}
        level={null}
        levelViews={levels.outer}
        innerViews={levels.inner}
        membership={groupOf}
        parents={props.groupParents}
        labels={groupLabels}
        openSubgraph={onSetSubgraphOpen ? openSubgraph : undefined}
        closeSubgraph={closeSubgraph}
      />

      <div className="mt-3 flex justify-center">
        <AddNodeButton
          shown="always"
          label={t('flow.list.addNode')}
          title={t('flow.list.addNodeTitle')}
          onClick={onAppend}
        />
      </div>
      {views.length === 0 ? <FirstNodeHint /> : null}
    </div>
  );
}

function FirstNodeHint(): React.ReactElement {
  return (
    <div className="mt-2 flex justify-center">
      <p
        className="bg-popover text-popover-foreground relative rounded-md border px-3 py-1.5
          text-xs shadow-sm"
      >
        <span
          aria-hidden
          className="bg-popover absolute -top-[5px] left-1/2 size-2 -translate-x-1/2 rotate-45
            border-t border-l"
        />
        {t('flow.list.firstNode')}
      </p>
    </div>
  );
}

export interface LevelListProps extends NodeListProps {
  readonly level: NodeId | null;
  readonly levelViews: readonly NodeView[];
  readonly innerViews: ReadonlyMap<NodeId, readonly NodeView[]>;
  readonly membership: Membership;
  readonly parents: GroupParents;
  readonly labels: readonly GroupLabel[];
  readonly openSubgraph: ((id: NodeId) => void) | undefined;
  readonly closeSubgraph: (id: NodeId) => void;
}

function LevelList(props: LevelListProps): React.ReactElement {
  const { level, levelViews, innerViews, membership, parents, labels } = props;
  const { onRenameGroup, onUngroup, onGroupColorChange, closeSubgraph } = props;
  const { onDeleteCards, onConvertGroup } = props;
  const { frames = NO_FRAMES, preview = null } = props;
  const kept = useOutline(levelViews, membership, parents, labels);
  const shown = preview !== null && previewLevel(preview) === level ? preview : null;
  const outline = withPreview(kept, shown);
  const ids = kept.map(entrySortId);
  const listsOf = new Map<string, FrameLists>();
  frameListsOf(kept, listsOf);
  const viewOf = new Map(levelViews.map((view) => [view.id, view]));
  const firstId = levelViews[0]?.id;

  const cardOf = (id: NodeId): React.ReactNode => {
    const view = viewOf.get(id);
    if (!view) return null;
    const frame = level === null ? frames.get(id) : undefined;
    if (frame) {
      return (
        <Fragment key={id}>
          <CardItem {...props} view={view} first={id === firstId} subgraphUses={frame.uses} />
          <SubgraphBranch frame={frame} head={view} onClose={closeSubgraph}>
            <LevelList
              {...props}
              level={id}
              levelViews={innerViews.get(id) ?? NO_VIEWS}
              membership={frame.membership}
              parents={frame.parents}
              labels={frame.groupLabels}
            />
          </SubgraphBranch>
        </Fragment>
      );
    }
    return <CardItem key={id} {...props} view={view} first={id === firstId} />;
  };

  const entryOf = (entry: OutlineEntry): React.ReactNode => {
    if (entry.kind === 'card') return cardOf(entry.id);
    const lists = listsOf.get(entry.label.key);
    return (
      <CardGroupFrame
        key={entryKey(entry)}
        label={entry.label}
        items={lists?.items ?? NO_ITEMS}
        memberIds={lists?.members ?? NO_MEMBERS}
        onRename={onRenameGroup}
        onUngroup={onUngroup}
        onDeleteMembers={onDeleteCards}
        onConvertToSubgraph={level === null ? onConvertGroup : undefined}
        onColorChange={onGroupColorChange}
      >
        {entry.entries.map(entryOf)}
      </CardGroupFrame>
    );
  };

  return (
    <SortableContext
      {...(level === null ? {} : { id: subgraphContainerId(level) })}
      items={ids}
      strategy={keepInPlace}
    >
      <ol className="flex flex-col gap-3">{outline.map(entryOf)}</ol>
    </SortableContext>
  );
}
