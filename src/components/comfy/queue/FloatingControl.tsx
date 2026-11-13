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
import { t } from '@/i18n';
import type { FloatingPosition } from '@/lib/floating-position';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 実行の操作をタブの中のどこへでも動かせるように浮かせる。ドラッグは dnd-kit に任せる。
// ─────────────────────────────

/**
 * 枠の幅の見込み。既定の置き場所と、はみ出しの寄せに使う。
 * 枠は中身の幅（`w-max`）なので、失敗のアイコンが出たときの幅で見込む。
 * 出ていないときは右端に少し隙間が残るが、アイコンがはみ出して押せなくなるよりよい
 */
const PANEL_WIDTH = 216;
const DRAG_ID = 'control-panel';
/** 感知の設定は作り直さない（毎回新しいと DndContext の中身が変わり、中が描き直しになる） */
const POINTER_OPTIONS = { activationConstraint: { distance: 4 } };

/**
 * 掴んでいる間、**枠の親（タブ全体の層）の中に留める**。
 * `@dnd-kit/modifiers` の restrictToParentElement と同じ計算を、依存を足さずに持つ
 */
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
  // 掴めるのは取っ手だけ。枠全体に付けると、ボタンの Enter / 空白でも掴んでしまう
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
        // 窓を縮めて外に出たぶんは内側へ寄せる（保存した値は変えない）
        left: `min(${String(position.left)}px, calc(100% - ${String(PANEL_WIDTH)}px))`,
        bottom: `min(${String(position.bottom)}px, calc(100% - 2.75rem))`,
        transform: CSS.Translate.toString(drag.transform),
      }}
    >
      <ControlPanel connected={connected} handle={handle} />
    </div>
  );
}

/** 浮かせたコントロールパネルの受け取り物 */
export interface FloatingControlProps {
  readonly connected: boolean;
}

/**
 * タブ全体に重ねる層。層そのものは押せず、枠だけが押せる。
 * 掴んでいる間はタブの中に留め、離したら置き場所を端末に残す
 */
export function FloatingControl({ connected }: FloatingControlProps): React.ReactElement {
  const saved = useSettingsStore((state) => state.controlPosition);
  const appWidth = useSettingsStore((state) => state.columnWidths.app);
  const moveControl = useSettingsStore((state) => state.moveControl);

  // 既定はアプリ入力の列の右下（値を変えた手のすぐ近く）
  const position = saved ?? { left: Math.max(0, appWidth - PANEL_WIDTH), bottom: 0 };

  // 押しただけで動かないよう、少し引いてから掴む（取っ手のクリックを邪魔しない）。
  // キーボードだけでも動かせるよう KeyboardSensor を入れる（取っ手で空白キー → 矢印キー → 空白キー）
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS), useSensor(KeyboardSensor));

  const onDragEnd = (event: DragEndEvent): void => {
    // 掴んでいる間の制限（keepInside）を通った量が届く
    moveControl(position, event.delta.x, event.delta.y);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
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
