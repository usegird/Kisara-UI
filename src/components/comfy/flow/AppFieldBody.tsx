import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { ArrowLeftToLine, ArrowUpRight, Bot, Brush, GripVertical } from 'lucide-react';
import { memo, useContext } from 'react';

import { AnchorContext, appSourceAnchorKey } from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { HeightHandle } from '@/components/comfy/flow/HeightHandle';
import { SpanHandle } from '@/components/comfy/flow/SpanHandle';
import { WidgetControl } from '@/components/comfy/flow/WidgetControl';
import { RenderProbe } from '@/components/ui/render-probe';
import { promptNodeIdFor } from '@/graph/app-input-values';
import { DEFAULT_MULTILINE_HEIGHT } from '@/graph/multiline-height';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { formatEditValue } from '@/lib/text';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useStylesStore } from '@/store/use-styles-store';

interface AppFieldBodyProps {
  readonly nodeId: NodeId;
  readonly row: NodeRow;
  readonly span: number;
  readonly height: number | undefined;
  readonly unit: number | null;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  readonly argument: string | null;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
}

export const AppFieldBody = memo(function AppFieldBody(
  props: AppFieldBodyProps,
): React.ReactElement {
  return (
    <RenderProbe id="AppField">
      <AppFieldContent {...props} />
    </RenderProbe>
  );
});

function AppFieldContent({
  nodeId,
  row,
  span,
  height = DEFAULT_MULTILINE_HEIGHT,
  unit,
  onNeedOptions,
  onResize,
  onResizeHeight,
  argument,
  attributes,
  listeners,
}: AppFieldBodyProps): React.ReactElement {
  const promptNodeId = promptNodeIdFor(nodeId, row);
  const value = useAppValuesStore((state) => state.values.get(promptNodeId)?.[row.widgetName]);
  const setValue = useAppValuesStore((state) => state.setValue);

  const cardValue = formatEditValue(row.value);
  const entered = value !== undefined;

  const stacked = row.multiline;
  const anchors = useContext(AnchorContext);
  const importable = useContext(FlowLookContext).appImport;
  const stylesReady = useStylesStore(
    (state) => state.status === 'ready' || state.status === 'saving',
  );
  const requestNewStyle = useStylesStore((state) => state.requestNewStyle);

  const grip = (
    <button
      type="button"
      className={appFieldGrip({ stacked })}
      aria-label={t('flow.shared.reorder', { name: row.label })}
      title={t('flow.appInput.dragToReorder')}
      {...attributes}
      {...listeners}
      {...MENU_ACTION}
    >
      <GripVertical className="size-3.5" aria-hidden />
    </button>
  );

  const importButton =
    !importable || cardValue.length === 0 ? null : (
      <button
        type="button"
        className="text-foreground/70 hover:text-foreground shrink-0 rounded p-0.5"
        {...MENU_ACTION}
        aria-label={t('flow.appInput.importLabel', { name: row.label })}
        title={t('flow.appInput.importTitle', { value: cardValue })}
        onClick={() => setValue(promptNodeId, row.widgetName, row.value)}
      >
        <ArrowLeftToLine className="size-3.5" aria-hidden />
      </button>
    );

  const shownText = entered ? formatEditValue(value) : cardValue;
  const styleButton =
    !stacked || !stylesReady || shownText.length === 0 ? null : (
      <button
        type="button"
        className="text-foreground/70 hover:text-foreground shrink-0 rounded p-0.5"
        {...MENU_ACTION}
        aria-label={t('flow.appInput.toStyleLabel', { name: row.label })}
        title={t('flow.appInput.toStyleTitle')}
        onClick={() => requestNewStyle(shownText)}
      >
        <span className="relative block size-3.5" aria-hidden>
          <Brush className="size-3" />
          <ArrowUpRight className="absolute -right-1 -bottom-0.5 size-2.5" strokeWidth={3} />
        </span>
      </button>
    );

  const argumentMark =
    argument === null ? null : (
      <Bot
        className="text-success size-3.5 shrink-0"
        role="img"
        aria-label={t('flow.appInput.argument', { name: argument })}
      >
        <title>{t('flow.appInput.argument', { name: argument })}</title>
      </Bot>
    );

  const control = (
    <WidgetControl
      key={row.name}
      row={row}
      value={entered ? value : ''}
      placeholder={cardValue}
      onCommit={(_row, next) => setValue(promptNodeId, row.widgetName, next)}
      onNeedOptions={onNeedOptions}
      height={stacked ? height : undefined}
    />
  );

  const field = (
    <div
      ref={anchors?.register(appSourceAnchorKey(nodeId, row.widgetName))}
      className="relative min-w-0"
    >
      {control}
      <SpanHandle
        label={row.label}
        span={span}
        unit={unit}
        guide={row.type === 'BOOLEAN'}
        onChange={(next) => onResize(nodeId, row.widgetName, next)}
      />
      {stacked ? (
        <HeightHandle
          label={row.label}
          height={height}
          onChange={(next) => onResizeHeight(nodeId, row.widgetName, next)}
          menuAction
        />
      ) : null}
    </div>
  );

  return stacked ? (
    <>
      <div className="mb-0.5 flex items-center gap-1">
        {grip}
        <span className="text-foreground/80 min-w-0 truncate" title={row.label}>
          {row.label}
        </span>
        {argumentMark}
        <span className="ml-auto flex shrink-0 gap-1">
          {styleButton}
          {importButton}
        </span>
      </div>
      {field}
    </>
  ) : (
    <>
      {grip}
      <span className="flex min-w-0 items-start gap-0.5 pt-[5px] pr-[5px]">
        <span className="text-foreground/80 min-w-0 truncate" title={row.label}>
          {row.label}
        </span>
        {argumentMark}
      </span>
      {field}
      {importable ? (
        <span className="mt-1 flex w-5 shrink-0 justify-end">{importButton}</span>
      ) : null}
    </>
  );
}

const appFieldGrip = cva(
  'text-muted-foreground hover:bg-muted -ml-1 shrink-0 cursor-grab rounded p-0.5',
  {
    variants: {
      stacked: { true: '', false: 'mt-1' },
    },
  },
);
