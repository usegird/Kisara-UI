import { useDraggable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { memo, useContext } from 'react';

import { AnchorContext, variableAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { outputDragData, outputDragId } from '@/components/comfy/flow/link-dnd';
import { valueTooltip } from '@/components/comfy/flow/value-tooltip';
import { ValueText } from '@/components/comfy/flow/ValueText';
import { groupPadding } from '@/components/comfy/flow/variable-panel-values';
import { draggableAttributes } from '@/components/ui/drag-announcements';
import { joinValues } from '@/graph/output-values';
import type { NodeId } from '@/graph/types';
import { VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import type { VariableBox } from '@/graph/variables';
import { t } from '@/i18n';
import { slotColor } from '@/styles/slot-color';

const { BOX_HEIGHT } = VARIABLE_PANEL_METRICS;

const variableBox = cva(
  [
    'border-border bg-card absolute inset-0 flex cursor-grab items-center gap-1.5 rounded',
    'border px-1.5 text-left text-2xs',
  ],
  {
    variants: {
      muted: { true: 'border-dashed', false: '' },
      dragging: { true: 'opacity-50', false: '' },
    },
  },
);

function typeLabel(box: VariableBox): string {
  return box.type === '*' ? box.name : box.type;
}

function BoxLabel({ box }: { readonly box: VariableBox }): React.ReactElement {
  return (
    <>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: slotColor(box.type) }}
      />
      <span className="shrink-0 font-medium">{box.name}</span>
      {box.values.length > 0 ? (
        <ValueText values={box.values} className="text-muted-foreground min-w-0 truncate" />
      ) : null}
    </>
  );
}

export const Box = memo(function Box({
  box,
  top,
  index,
  onAddAfter,
}: {
  readonly box: VariableBox;
  readonly top: number;
  readonly index: string | null;
  readonly onAddAfter?: ((id: NodeId, slot: number, type: string) => void) | undefined;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const pad = groupPadding(useContext(FlowLookContext).roomy);
  const draggable = useDraggable({
    id: outputDragId(box.nodeId, box.slot, 'panel'),
    data: {
      ...outputDragData(box.nodeId, box.slot, typeLabel(box), joinValues(box.values)),
      label: box.name,
    },
    attributes: draggableAttributes(),
  });
  const anchor = anchors?.register(variableAnchorKey(box.key));

  return (
    <div
      ref={anchor}
      className="group/box absolute"
      style={{ top, left: pad, right: pad, height: BOX_HEIGHT }}
    >
      <button
        type="button"
        ref={(element) => {
          draggable.setNodeRef(element);
        }}
        className={variableBox({ muted: box.muted, dragging: draggable.isDragging })}
        title={valueTooltip(index, `${box.sourceLabel} / ${box.name}`, box.values, box.muted)}
        {...draggable.attributes}
        {...draggable.listeners}
      >
        <BoxLabel box={box} />
      </button>

      {onAddAfter ? (
        <button
          type="button"
          className="text-muted-foreground absolute top-1/2 z-10 flex -translate-y-1/2
            items-center justify-center opacity-0 transition-opacity hover:opacity-100
            focus:opacity-100"
          style={{ right: '100%', marginRight: 5, width: 10, height: 18 }}
          aria-label={t('flow.shared.addAfter', { name: box.name })}
          title={t('flow.variables.addAfterTitle')}
          onClick={() => onAddAfter(box.nodeId, box.slot, box.type)}
        >
          <span
            aria-hidden
            className="block h-0 w-0 border-y-[7px] border-r-[8px] border-y-transparent"
            style={{ borderRightColor: 'currentColor' }}
          />
        </button>
      ) : null}
    </div>
  );
});
