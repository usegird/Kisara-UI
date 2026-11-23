import { useDroppable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { memo, useCallback, useContext, useLayoutEffect, useRef, type RefObject } from 'react';

import { AnchorContext, inputAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { inputDropData, inputDropId } from '@/components/comfy/flow/link-dnd';
import { LinkDragContext } from '@/components/comfy/flow/link-drag-context';
import { LinkChip } from '@/components/comfy/flow/LinkChip';
import { AddBeforeButton, RowHeading } from '@/components/comfy/flow/RowHeading';
import { useChipMotion } from '@/components/comfy/flow/use-chip-motion';
import { WidgetControl } from '@/components/comfy/flow/WidgetControl';
import { RenderProbe } from '@/components/ui/render-probe';
import { DEFAULT_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow as NodeRowData } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { formatDisplayValue } from '@/i18n/format';

export interface NodeRowProps {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  readonly onDisconnect?: ((linkId: number) => void) | undefined;
  readonly onAddBefore?: ((id: number, row: NodeRowData) => void) | undefined;
  readonly onToggleAppInput?: ((id: number, widgetName: string) => void) | undefined;
}

const rowBox = cva(
  `group/row data-[drop-over]:bg-accent data-[drop-over]:ring-ring relative flex min-h-7
    text-xs data-[drop-over]:ring-2 data-[drop-over]:ring-inset`,
  {
    variants: {
      stacked: { true: 'flex-col items-start gap-0.5', false: 'items-center' },
      roomy: { false: 'pr-3', true: 'pr-6' },
      compact: { true: 'pl-0.5', false: '' },
    },
    compoundVariants: [
      { compact: false, roomy: false, class: 'pl-1' },
      { compact: false, roomy: true, class: 'pl-2' },
      { stacked: false, compact: false, class: 'gap-3' },
      { stacked: false, compact: true, class: 'gap-1.5' },
      { stacked: false, roomy: false, class: 'py-0.5' },
      { stacked: true, roomy: false, class: 'py-1' },
      { stacked: false, roomy: true, class: 'py-1' },
      { stacked: true, roomy: true, class: 'py-2' },
    ],
  },
);

const rowValue = cva('min-w-0', {
  variants: { stacked: { true: 'w-full pl-[5px]', false: 'flex-1' } },
});

function isStacked(row: NodeRowData): boolean {
  return row.multiline && row.kind !== 'link' && !row.appInput;
}

export function NodeRow(props: NodeRowProps): React.ReactElement {
  const { nodeId, row } = props;
  const anchors = useContext(AnchorContext);
  const { roomy, compact } = useContext(FlowLookContext);
  const linkDragging = useContext(LinkDragContext);
  const element = useRef<HTMLDivElement | null>(null);
  const anchor = row.kind === 'link' ? anchors?.register(inputAnchorKey(nodeId, row.name)) : null;
  const attachRow = useCallback(
    (next: HTMLDivElement | null) => {
      anchor?.(next);
      element.current = next;
    },
    [anchor],
  );

  return (
    <div
      ref={attachRow}
      data-menu-row={row.label}
      className={rowBox({ stacked: isStacked(row), roomy, compact })}
    >
      {linkDragging && row.linkable ? (
        <RenderProbe id="RowDropTarget">
          <RowDropTarget nodeId={nodeId} row={row} element={element} />
        </RenderProbe>
      ) : null}
      <NodeRowBody {...props} />
    </div>
  );
}

function RowDropTarget({
  nodeId,
  row,
  element,
}: {
  readonly nodeId: NodeId;
  readonly row: NodeRowData;
  readonly element: RefObject<HTMLDivElement | null>;
}): null {
  const widgetDrop = row.kind === 'widget' ? { name: row.widgetName, type: row.type } : null;
  const { setNodeRef, isOver } = useDroppable({
    id: inputDropId(nodeId, row.inputSlot ?? -1, widgetDrop?.name ?? null),
    data: { ...inputDropData(nodeId, row.inputSlot ?? -1, widgetDrop), label: row.label },
  });
  useLayoutEffect(() => {
    setNodeRef(element.current);
  }, [element, setNodeRef]);
  useLayoutEffect(() => {
    const target = element.current;
    target?.toggleAttribute('data-drop-over', isOver);
    return () => target?.removeAttribute('data-drop-over');
  }, [element, isOver]);
  return null;
}

const NodeRowBody = memo(function NodeRowBody(props: NodeRowProps): React.ReactElement {
  return (
    <RenderProbe id="NodeRow">
      <NodeRowContent {...props} />
    </RenderProbe>
  );
});

function NodeRowContent(props: NodeRowProps): React.ReactElement {
  const { nodeId, row, onDisconnect, onAddBefore, onToggleAppInput } = props;
  const chip = useChipMotion(row, onDisconnect);
  const stacked = isStacked(row);

  return (
    <>
      {onAddBefore && row.linkable ? (
        <AddBeforeButton nodeId={nodeId} row={row} onAddBefore={onAddBefore} />
      ) : null}

      <RowHeading nodeId={nodeId} row={row} stacked={stacked} onToggleAppInput={onToggleAppInput} />

      <div className={rowValue({ stacked })}>
        {row.kind === 'link' && row.source ? (
          <LinkChip
            nodeId={nodeId}
            row={row}
            source={row.source}
            motion={chip.motion}
            onMotionEnd={chip.end}
            onDisconnect={onDisconnect ? chip.start : undefined}
          />
        ) : null}
        {row.kind === 'widget' ? <RowWidget {...props} stacked={stacked} /> : null}
        <RowNote row={row} />
      </div>
    </>
  );
}

function RowWidget(props: NodeRowProps & { readonly stacked: boolean }): React.ReactElement {
  const { row, stacked, ...rest } = props;
  const sized = row.multiline && !row.appInput;
  return (
    <div className="relative">
      <WidgetControl
        {...rest}
        row={stacked || !row.multiline ? row : { ...row, multiline: false }}
        readOnly={row.appInput}
        appearance="underline"
        height={sized ? (row.height ?? DEFAULT_MULTILINE_HEIGHT) : undefined}
      />
    </div>
  );
}

function RowNote({ row }: { readonly row: NodeRowData }): React.ReactElement | null {
  if (row.kind === 'socket') {
    return (
      <span className="text-muted-foreground text-xs">
        {t(row.required ? 'flow.row.unconnectedRequired' : 'flow.row.unconnected')}
      </span>
    );
  }
  if (row.kind !== 'unresolved') return null;
  if (row.value === undefined) {
    return <span className="text-muted-foreground text-xs">{t('flow.row.unknownName')}</span>;
  }
  return (
    <span
      className="border-input text-muted-foreground block truncate rounded-md border
        border-dashed px-2 py-0.5 text-xs"
      title={t('flow.row.unknownNameTitle')}
    >
      {formatDisplayValue(row.value)}
    </span>
  );
}
