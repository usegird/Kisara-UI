/* eslint-disable react-hooks/refs --
 * useSortable の戻り値（setNodeRef などを含む）がまるごと ref とみなされる誤検知。
 * 描画中に .current を読んではいない。
 */
import {
  DndContext,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { memo, useContext } from 'react';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { noLayoutAnimation } from '@/components/comfy/flow/flow-dnd';
import { CARD_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import { NodeCardContent, type NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { RenderProbe } from '@/components/ui/render-probe';
import { DRAGGING_Z_INDEX } from '@/components/ui/sortable-style';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { NodeRow as NodeRowData, NodeView } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

const cardItem = cva('relative', {
  variants: {
    motion: CARD_MOTION,
  },
});

export interface NodeCardProps {
  readonly view: NodeView;
  readonly state?: NodeCardState | undefined;
  readonly definitionsLoaded?: boolean | undefined;
  readonly onSelect?: ((id: number, additive?: boolean) => void) | undefined;
  readonly selected?: boolean | undefined;
  readonly onCommentChange?: ((id: number, comment: string) => void) | undefined;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  readonly onResizeText?: ((row: NodeRowData, height: number) => void) | undefined;
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  readonly onOpenSettings?: ((id: number) => void) | undefined;
  readonly onSettingsChange?: ((id: number, patch: NodeSettingsPatch) => void) | undefined;
  readonly onDelete?: ((id: number) => void) | undefined;
  readonly onClone?: ((id: number) => void) | undefined;
  readonly onGroup?: ((id: number) => void) | undefined;
  readonly onDisconnect?: ((linkId: number) => void) | undefined;
  readonly onAddAfter?: ((id: number, slot: number, type: string) => void) | undefined;
  readonly onAddBefore?: ((id: number, row: NodeRowData) => void) | undefined;
  readonly onToggleAppInput?: ((id: number, widgetName: string) => void) | undefined;
  readonly onToggleCollapsed?: ((id: number) => void) | undefined;
  readonly onOpenSubgraph?: ((id: NodeId) => void) | undefined;
  readonly subgraphOpen?: boolean | undefined;
  readonly onCloseSubgraph?: ((id: NodeId) => void) | undefined;
  readonly subgraphUses?: number | undefined;
  readonly onConvertSubgraph?: ((id: NodeId) => void) | undefined;
  readonly onInsertAbove?: ((id: NodeId) => void) | undefined;
  readonly insertAt?: 'gap' | 'edge' | undefined;
  readonly motion?: MotionKind | undefined;
  readonly onMotionEnd?: ((id: NodeId) => void) | undefined;
}

export function NodeCard({
  motion = 'none',
  onMotionEnd,
  ...props
}: NodeCardProps): React.ReactElement {
  const { view } = props;
  const sortable = useSortable({
    id: view.id,
    data: { label: view.displayName },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  const zoom = useContext(ColumnZoomContext);
  const onCardAnimationEnd = (event: React.AnimationEvent<HTMLLIElement>): void => {
    if (motion !== 'none' && event.target === event.currentTarget) onMotionEnd?.(view.id);
  };

  return (
    <li
      ref={sortable.setNodeRef}
      data-sort-id={view.id}
      data-menu-scope={view.displayName}
      className={cardItem({ motion })}
      onAnimationEnd={onCardAnimationEnd}
      style={{
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? DRAGGING_Z_INDEX : undefined,
      }}
    >
      <NodeCardBody
        {...props}
        dragging={sortable.isDragging}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </li>
  );
}

const PREVIEW_ATTRIBUTES: Omit<DraggableAttributes, 'aria-roledescription'> = {
  role: 'button',
  tabIndex: -1,
  'aria-disabled': true,
  'aria-pressed': undefined,
  'aria-describedby': '',
};

export function NodeCardPreview({ view }: { readonly view: NodeView }): React.ReactElement {
  return (
    <AnchorContext.Provider value={null}>
      <DndContext>
        <div inert className="w-72">
          <NodeCardContent
            view={view}
            dragging={false}
            attributes={{
              ...PREVIEW_ATTRIBUTES,
              'aria-roledescription': sortableAttributes().roleDescription,
            }}
            listeners={undefined}
          />
        </div>
      </DndContext>
    </AnchorContext.Provider>
  );
}

export type NodeCardBodyProps = Omit<NodeCardProps, 'motion' | 'onMotionEnd'> & {
  readonly dragging: boolean;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
};

const NodeCardBody = memo(function NodeCardBody(props: NodeCardBodyProps): React.ReactElement {
  return (
    <RenderProbe id="NodeCard">
      <NodeCardContent {...props} />
    </RenderProbe>
  );
});

export type CardActions = Pick<
  NodeCardProps,
  | 'onSelect'
  | 'onCommentChange'
  | 'onToggleCollapsed'
  | 'onAddAfter'
  | 'onOpenSettings'
  | 'onSettingsChange'
  | 'onClone'
  | 'onGroup'
  | 'onDelete'
  | 'onOpenSubgraph'
  | 'subgraphOpen'
  | 'onCloseSubgraph'
  | 'subgraphUses'
  | 'onConvertSubgraph'
>;
