/* eslint-disable react-hooks/refs --
 * useSortable の戻り値（setNodeRef などを含む）がまるごと ref とみなされる誤検知。
 * 描画中に .current を読んではいない。
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import { ROW_GRID } from '@/components/comfy/flow/app-input-look';
import { AppFieldBody } from '@/components/comfy/flow/AppFieldBody';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { noLayoutAnimation } from '@/components/comfy/flow/flow-dnd';
import { CHIP_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { appInputDragId } from '@/graph/app-input-order';
import { appInputSpanKey } from '@/graph/app-inputs';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

interface AppFieldProps {
  readonly nodeId: NodeId;
  readonly group: { readonly index: string | null; readonly label: string };
  readonly row: NodeRow;
  readonly span: number;
  readonly height: number | undefined;
  readonly unit: number | null;
  readonly aligned: boolean;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  readonly argument: string | null;
  readonly motion?: MotionKind | undefined;
  readonly onMotionEnd?: ((key: string) => void) | undefined;
}

export function AppField({
  nodeId,
  group,
  row,
  span,
  height,
  unit,
  aligned,
  onNeedOptions,
  onResize,
  onResizeHeight,
  argument,
  motion = 'none',
  onMotionEnd,
}: AppFieldProps): React.ReactElement {
  const sortable = useSortable({
    id: appInputDragId({ nodeId, widgetName: row.widgetName }),
    data: {
      appDrag: { index: group.index, label: group.label, row: row.label },
      label: row.label,
    },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  const zoom = useContext(ColumnZoomContext);

  return (
    <div
      ref={sortable.setNodeRef}
      data-menu-row={row.label}
      className={appField({
        layout: fieldLayoutOf(row.multiline, aligned),
        aligned,
        dragging: sortable.isDragging,
        motion,
      })}
      onAnimationEnd={(event) => {
        if (motion !== 'none' && event.target === event.currentTarget) {
          onMotionEnd?.(appInputSpanKey(nodeId, row.widgetName));
        }
      }}
      style={{
        gridColumn: aligned ? undefined : `span ${String(span)}`,
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
      }}
    >
      <AppFieldBody
        nodeId={nodeId}
        row={row}
        span={span}
        height={height}
        unit={unit}
        onNeedOptions={onNeedOptions}
        onResize={onResize}
        onResizeHeight={onResizeHeight}
        argument={argument}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </div>
  );
}

const appField = cva('relative min-w-0 text-xs', {
  variants: {
    layout: { multiline: 'block', subgrid: 'grid grid-cols-subgrid items-start', own: ROW_GRID },
    aligned: { true: 'col-span-4', false: '' },
    dragging: { true: 'opacity-30', false: '' },
    motion: CHIP_MOTION,
  },
});

function fieldLayoutOf(multiline: boolean, aligned: boolean): 'multiline' | 'subgrid' | 'own' {
  if (multiline) return 'multiline';
  return aligned ? 'subgrid' : 'own';
}
