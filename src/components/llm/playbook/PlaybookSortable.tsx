import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';

import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility, sortableAttributes } from '@/components/ui/drag-announcements';
import { sortableStyle } from '@/components/ui/sortable-style';

// ─────────────────────────────
// プレイブックを作るダイアログの並べ替え。フェーズの並びと、フェーズの操作・常設の操作の並びで使う。
// ─────────────────────────────

/** 掴みのボタンかキーボードで並べ替えられる縦の並び。動かしたら元と先の位置を渡す */
export function SortableRows({
  ids,
  onMove,
  children,
}: {
  readonly ids: readonly string[];
  readonly onMove: (from: number, to: number) => void;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (over === null || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={dragAccessibility()}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-0.5">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}

/** 並べ替えられる 1 行。掴みのボタンを左に置き、中身は `children` */
export function SortableRow({
  id,
  label,
  children,
}: {
  readonly id: string;
  /** 掴みのボタンの読み上げ */
  readonly label: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    attributes: sortableAttributes(),
  });
  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className="flex items-start gap-1"
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground mt-1.5 cursor-grab touch-none
          rounded-sm"
        aria-label={label}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
