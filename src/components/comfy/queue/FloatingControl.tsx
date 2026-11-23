/* eslint-disable react-hooks/refs --
 * useDraggable の戻り値（setNodeRef などを含む）がまるごと ref とみなされる誤検知。
 * 描画中に .current を読んではいない（AppInputPanel・NodeCard と同じ）。
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import { ControlPanel } from '@/components/comfy/queue/ControlPanel';
import { dragAccessibility, draggableAttributes } from '@/components/ui/drag-announcements';
import { ABOVE_DIALOG_WINDOWS_LAYER } from '@/hooks/ui/use-dialog-window';
import { t } from '@/i18n';
import type { FloatingPosition } from '@/lib/floating-position';
import { useSettingsStore } from '@/store/use-settings-store';

const PANEL_WIDTH = 216;
const DRAG_ID = 'control-panel';
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };

const keepInside: Modifier = ({ transform, containerNodeRect, draggingNodeRect }) => {
  if (containerNodeRect === null || draggingNodeRect === null) return transform;

  const minX = containerNodeRect.left - draggingNodeRect.left;
  const maxX = containerNodeRect.right - draggingNodeRect.right;
  const minY = containerNodeRect.top - draggingNodeRect.top;
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom;

  return {
    ...transform,
    x: Math.min(maxX, Math.max(minX, transform.x)),
    y: Math.min(maxY, Math.max(minY, transform.y)),
  };
};

function DraggablePanel({
  connected,
  position,
}: {
  readonly connected: boolean;
  readonly position: FloatingPosition;
}): React.ReactElement {
  const drag = useDraggable({
    id: DRAG_ID,
    data: { label: t('run.control.panel') },
    attributes: draggableAttributes(),
  });

  const handle = (
    <button
      type="button"
      ref={drag.setActivatorNodeRef}
      className="text-muted-foreground hover:bg-muted -ml-0.5 shrink-0 cursor-grab touch-none
        rounded p-0.5 active:cursor-grabbing"
      aria-label={t('run.control.move')}
      title={t('run.control.moveHint')}
      {...drag.attributes}
      {...drag.listeners}
    >
      <GripVertical className="size-3.5" aria-hidden />
    </button>
  );

  return (
    <div
      ref={drag.setNodeRef}
      className="pointer-events-auto absolute w-max"
      style={{
        left: `min(${String(position.left)}px, calc(100% - ${String(PANEL_WIDTH)}px))`,
        bottom: `min(${String(position.bottom)}px, calc(100% - 2.75rem))`,
        transform: CSS.Translate.toString(drag.transform),
      }}
    >
      <ControlPanel connected={connected} handle={handle} />
    </div>
  );
}

export interface FloatingControlProps {
  readonly connected: boolean;
}

export function FloatingControl({ connected }: FloatingControlProps): React.ReactElement {
  const saved = useSettingsStore((state) => state.controlPosition);
  const appWidth = useSettingsStore((state) => state.columnWidths.app);
  const moveControl = useSettingsStore((state) => state.moveControl);

  const position = saved ?? { left: Math.max(0, appWidth - PANEL_WIDTH), bottom: 0 };

  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS), useSensor(KeyboardSensor));

  const onDragEnd = (event: DragEndEvent): void => {
    moveControl(position, event.delta.x, event.delta.y);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: ABOVE_DIALOG_WINDOWS_LAYER }}
    >
      <DndContext
        sensors={sensors}
        modifiers={[keepInside]}
        accessibility={dragAccessibility()}
        onDragEnd={onDragEnd}
      >
        <DraggablePanel connected={connected} position={position} />
      </DndContext>
    </div>
  );
}
