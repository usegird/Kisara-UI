import { useDraggable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import { AnchorContext, outputChipAnchorKey } from '@/components/comfy/flow/anchor-context';
import { outputDragData, outputDragId } from '@/components/comfy/flow/link-dnd';
import { draggableAttributes } from '@/components/ui/drag-announcements';
import { joinValues } from '@/graph/output-values';
import type { NodeOutputView } from '@/graph/rows';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 出力チップ。パラメータ行へドラッグすると接続でき、下の ▼ からこの出力の先にノードを足せる。
// ─────────────────────────────

const outputChip = cva(
  [
    'bg-muted inline-flex max-w-full cursor-grab items-center gap-1.5 truncate rounded-full',
    'px-2.5 py-0.5 text-2xs',
  ],
  { variants: { dragging: { true: 'opacity-50', false: '' } } },
);

/** 出力チップの受け取り物 */
export interface OutputChipProps {
  readonly nodeId: number;
  readonly slot: number;
  readonly output: NodeOutputView;
  /** 出力チップの下の ▼ から、その出力の先にノードを足す */
  readonly onAddAfter?: ((id: number, slot: number, type: string) => void) | undefined;
}

/** 掴める出力の名前の札と、その下のノードを足す ▼ を出す */
export function OutputChip({
  nodeId,
  slot,
  output,
  onAddAfter,
}: OutputChipProps): React.ReactElement {
  const draggable = useDraggable({
    id: outputDragId(nodeId, slot, 'card'),
    data: {
      ...outputDragData(nodeId, slot, output.type, joinValues(output.values)),
      label: output.name,
    },
    attributes: draggableAttributes(),
  });
  // 掴んでいる間の線の引き元（DragLine）
  const anchor = useContext(AnchorContext)?.register(outputChipAnchorKey(nodeId, slot));

  return (
    <span className="group/chip relative flex min-w-0 flex-col items-center">
      <button
        type="button"
        ref={(element) => {
          anchor?.(element);
          draggable.setNodeRef(element);
        }}
        className={outputChip({ dragging: draggable.isDragging })}
        style={{ boxShadow: `inset 0 0 0 1px ${slotColor(output.type)}` }}
        title={t('flow.output.dragTitle', { name: output.name })}
        {...draggable.attributes}
        {...draggable.listeners}
        // 基盤の付ける止まる所を打ち消し、メニューから届くようにする
        {...MENU_ACTION}
      >
        <span className="truncate">{output.name}</span>
      </button>

      {onAddAfter ? (
        <button
          type="button"
          // 下の隙間の ⊕（z-10）より上に置く。三角の下側に指を運んでもこちらが勝つ
          className="absolute -bottom-2.5 z-20 rounded-sm px-1 opacity-0 transition-opacity
            group-hover/chip:opacity-100 focus:opacity-100"
          {...MENU_ACTION}
          aria-label={t('flow.shared.addAfter', { name: output.name })}
          title={t('flow.output.addAfterTitle')}
          onClick={() => onAddAfter(nodeId, slot, output.type)}
        >
          <span
            aria-hidden
            className="block h-0 w-0 border-x-[18px] border-t-[8px] border-x-transparent"
            style={{ borderTopColor: slotColor(output.type) }}
          />
        </button>
      ) : null}
    </span>
  );
}
