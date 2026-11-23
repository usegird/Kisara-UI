import { useDraggable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { CHIP_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import {
  LINK_CHIP_ATTR,
  linkChipDragData,
  linkChipDragId,
} from '@/components/comfy/flow/link-dnd';
import { valueTooltip } from '@/components/comfy/flow/value-tooltip';
import { ValueText } from '@/components/comfy/flow/ValueText';
import { draggableAttributes } from '@/components/ui/drag-announcements';
import { joinValues } from '@/graph/output-values';
import type { NodeRow as NodeRowData, RowSource } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { slotColor } from '@/styles/slot-color';

const chipItem = cva('flex max-w-full items-center gap-1', {
  variants: {
    motion: CHIP_MOTION,
  },
});

const linkChip = cva(
  [
    'group/chip bg-muted inline-flex min-w-0 items-center gap-1.5 truncate rounded-full',
    'px-2.5 py-0.5 text-xs',
  ],
  {
    variants: {
      muted: { true: 'line-through', false: '' },
      dragging: { true: 'opacity-50', false: '' },
    },
  },
);

const chipLabel = cva('inline-flex min-w-0 items-center gap-1.5', {
  variants: { draggable: { true: 'cursor-grab', false: '' } },
});

interface LinkChipProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly source: RowSource;
  readonly motion: MotionKind;
  readonly onMotionEnd: () => void;
  readonly onDisconnect: (() => void) | undefined;
}

export function LinkChip({
  nodeId,
  row,
  source,
  motion,
  onMotionEnd,
  onDisconnect,
}: LinkChipProps): React.ReactElement {
  return (
    <span
      className={chipItem({ motion })}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onMotionEnd();
      }}
    >
      {onDisconnect ? (
        <DraggableChip nodeId={nodeId} row={row} source={source} onDisconnect={onDisconnect} />
      ) : (
        <span
          className={linkChip({ muted: source.muted, dragging: false })}
          style={{ boxShadow: `inset 0 0 0 1px ${slotColor(row.type)}` }}
          title={chipTitle(source)}
        >
          <span className={chipLabel({ draggable: false })}>
            <ChipLabel source={source} />
          </span>
        </span>
      )}
    </span>
  );
}

function DraggableChip({
  nodeId,
  row,
  source,
  onDisconnect,
}: {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly source: RowSource;
  readonly onDisconnect: () => void;
}): React.ReactElement {
  const draggable = useDraggable({
    id: linkChipDragId(source.linkId),
    data: {
      ...linkChipDragData(source, joinValues(source.values), {
        nodeId,
        slot: row.inputSlot ?? -1,
        inputName: row.name,
      }),
      label: source.label,
    },
    attributes: draggableAttributes(),
  });

  return (
    <span
      className={linkChip({ muted: source.muted, dragging: draggable.isDragging })}
      style={{ boxShadow: `inset 0 0 0 1px ${slotColor(row.type)}` }}
      title={chipTitle(source)}
    >
      <span
        ref={(element) => {
          draggable.setNodeRef(element);
        }}
        className={chipLabel({ draggable: true })}
        {...{ [LINK_CHIP_ATTR]: '' }}
        {...draggable.attributes}
        {...draggable.listeners}
        {...MENU_ACTION}
        data-menu-label={t('flow.row.dragLinkLabel', { name: row.label })}
      >
        <ChipLabel source={source} />
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive -ml-1.5 max-w-0 shrink-0
          overflow-hidden rounded-full opacity-0 group-focus-within/chip:ml-0
          group-focus-within/chip:max-w-3 group-focus-within/chip:opacity-100
          group-hover/chip:ml-0 group-hover/chip:max-w-3 group-hover/chip:opacity-100"
        {...MENU_ACTION}
        aria-label={t('flow.row.disconnectLabel', { name: row.label })}
        title={t('flow.row.disconnect')}
        onClick={onDisconnect}
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

function ChipLabel({ source }: { readonly source: RowSource }): React.ReactElement {
  return (
    <>
      {source.sourceIndex === null ? null : (
        <span className="text-muted-foreground shrink-0 font-semibold tabular-nums">
          {source.sourceIndex}
        </span>
      )}
      {source.values.length > 0 ? (
        <ValueText values={source.values} className="min-w-0 truncate" />
      ) : (
        <span className="truncate">{source.label}</span>
      )}
    </>
  );
}

function chipTitle(source: RowSource): string {
  return valueTooltip(source.sourceIndex, source.label, source.values, source.muted);
}
