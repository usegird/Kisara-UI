import { useDndMonitor, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
import { useContext, useState } from 'react';

import {
  AnchorContext,
  outputAnchorKey,
  outputChipAnchorKey,
  variableAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { dragPointer } from '@/components/comfy/flow/drag-pointer';
import { isOutputDrag, outputDragSource } from '@/components/comfy/flow/link-dnd';
import type { NodeId } from '@/graph/types';
import { variableKey } from '@/graph/variables';
import { leftAnchor, useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { bezierPath } from '@/lib/bezier';
import type { Point } from '@/lib/point';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 出力チップ・変数ボックスを掴んでいる間の線。DndContext の中に置く。
// ─────────────────────────────

interface Dragging {
  readonly source: 'card' | 'panel';
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly type: string;
  /** 掴んでいるものの位置（接続線と同じ座標）。まだ分からなければ null（元の位置に置く） */
  readonly to: Point | null;
}

/**
 * 掴んだ元から掴んでいるものまで線を引く。位置は掴んでいる間ずっと変わるので、状態はここだけに
 * 閉じる（フロー全体を動きのたびに描き直さない）
 */
export function DragLine(): React.ReactElement | null {
  const anchors = useContext(AnchorContext);
  const [dragging, setDragging] = useState<Dragging | null>(null);

  const follow = (event: DragStartEvent | DragMoveEvent): void => {
    const data = event.active.data.current;
    const source = outputDragSource(event.active.id);
    const client = dragPointer(event);
    const at = client && anchors ? anchors.localPoint(client.x, client.y) : null;
    if (!isOutputDrag(data) || source === null) return;

    setDragging({
      source,
      nodeId: data.nodeId,
      slot: data.slot,
      type: data.type,
      to: at,
    });
  };

  useDndMonitor({
    onDragStart: follow,
    onDragMove: follow,
    onDragEnd: () => setDragging(null),
    onDragCancel: () => setDragging(null),
  });

  // 元の位置は測り直した値から毎回引く（掴んでいる間に列が動いても付いていく）。
  // 掴んでいないときは何も受け取らない（送るたびに描き直さない）
  const origin = useAnchorRects(anchors, (rects) => {
    if (dragging === null) return undefined;
    return dragging.source === 'panel'
      ? rects.get(variableAnchorKey(variableKey(dragging.nodeId, dragging.slot)))
      : (rects.get(outputChipAnchorKey(dragging.nodeId, dragging.slot)) ??
          rects.get(outputAnchorKey(dragging.nodeId)));
  });

  if (!dragging || !anchors || !origin) return null;

  const from =
    dragging.source === 'panel'
      ? leftAnchor(origin)
      : // カードの出力は掴んだチップの下端の中央から
        { x: (origin.left + origin.right) / 2, y: origin.bottom };

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
