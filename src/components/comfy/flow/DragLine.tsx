import { useDndMonitor, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { useContext, useState } from 'react';

import {
  AnchorContext,
  inputAnchorKey,
  outputAnchorKey,
  outputChipAnchorKey,
  variableAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { dragPointer } from '@/components/comfy/flow/drag-pointer';
import {
  isOutputDrag,
  LINK_CHIP_ATTR,
  outputDragSource,
  type OutputDragSource,
} from '@/components/comfy/flow/link-dnd';
import type { NodeId } from '@/graph/types';
import { variableKey } from '@/graph/variables';
import {
  leftAnchor,
  useAnchorRects,
  type AnchorRect,
  type AnchorRegistry,
  type Rects,
} from '@/hooks/ui/use-anchor-registry';
import { bezierPath } from '@/lib/bezier';
import type { Point } from '@/lib/point';
import { slotColor } from '@/styles/slot-color';

interface RowGrab {
  readonly anchorKey: string;
  readonly offset: Point;
}

interface Dragging {
  readonly source: OutputDragSource;
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly type: string;
  readonly row: RowGrab | null;
  readonly to: Point | null;
}

export function DragLine(): React.ReactElement | null {
  const anchors = useContext(AnchorContext);
  const [dragging, setDragging] = useState<Dragging | null>(null);

  const follow = (event: DragStartEvent | DragMoveEvent, start: boolean): void => {
    const data = event.active.data.current;
    const source = outputDragSource(event.active.id);
    const client = dragPointer(event);
    const at = client && anchors ? anchors.localPoint(client.x, client.y) : null;
    if (!isOutputDrag(data) || source === null) return;

    const grabbed =
      start && data.row
        ? rowGrabOf(anchors, inputAnchorKey(data.row.nodeId, data.row.inputName), event)
        : null;
    const row = start ? grabbed : (dragging?.row ?? null);
    setDragging({ source, nodeId: data.nodeId, slot: data.slot, type: data.type, row, to: at });
  };

  useDndMonitor({
    onDragStart: (event) => follow(event, true),
    onDragMove: (event) => follow(event, false),
    onDragEnd: () => setDragging(null),
    onDragCancel: () => setDragging(null),
  });

  const origin = useAnchorRects(anchors, (rects) =>
    dragging === null ? undefined : originRectOf(rects, dragging),
  );

  if (!dragging || !anchors || !origin) return null;

  const from = originPointOf(dragging, origin);

  return (
    <svg
      aria-hidden
      data-drag-line
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <path
        d={bezierPath(from, dragging.to ?? from)}
        fill="none"
        stroke={slotColor(dragging.type)}
        strokeWidth={1.5}
        strokeOpacity={0.8}
      />
    </svg>
  );
}

function originRectOf(rects: Rects, dragging: Dragging): AnchorRect | undefined {
  if (dragging.source === 'panel') {
    return rects.get(variableAnchorKey(variableKey(dragging.nodeId, dragging.slot)));
  }
  if (dragging.source === 'row') {
    return dragging.row ? rects.get(dragging.row.anchorKey) : undefined;
  }
  return (
    rects.get(outputChipAnchorKey(dragging.nodeId, dragging.slot)) ??
    rects.get(outputAnchorKey(dragging.nodeId))
  );
}

function originPointOf(dragging: Dragging, origin: AnchorRect): Point {
  if (dragging.source === 'panel') return leftAnchor(origin);
  if (dragging.row) {
    return { x: origin.left + dragging.row.offset.x, y: origin.top + dragging.row.offset.y };
  }
  return { x: (origin.left + origin.right) / 2, y: origin.bottom };
}

function rowGrabOf(
  anchors: AnchorRegistry | null,
  anchorKey: string,
  event: DragStartEvent | DragMoveEvent,
): RowGrab | null {
  const target = event.activatorEvent?.target;
  const handle = target instanceof Element ? target.closest(`[${LINK_CHIP_ATTR}]`) : null;
  const chip = handle?.getBoundingClientRect();
  const row = anchors?.positions.getState().rects.get(anchorKey);
  if (!anchors || !chip || !row) return null;
  const bottom = anchors.localPoint(chip.left + chip.width / 2, chip.bottom);
  if (!bottom) return null;
  return { anchorKey, offset: { x: bottom.x - row.left, y: bottom.y - row.top } };
}
