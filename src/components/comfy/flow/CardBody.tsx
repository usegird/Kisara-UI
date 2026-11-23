import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import { AddNodeButton } from '@/components/comfy/flow/AddNodeButton';
import {
  AnchorContext,
  bodyAnchorKey,
  outputAnchorKey,
} from '@/components/comfy/flow/anchor-context';
import { anchorStyle } from '@/components/comfy/flow/card-style';
import { OutputChips } from '@/components/comfy/flow/CardOutputChips';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import { TextHeightHandle } from '@/components/comfy/flow/HeightHandle';
import type { CardActions, NodeCardBodyProps } from '@/components/comfy/flow/NodeCard';
import { NodeRow } from '@/components/comfy/flow/NodeRow';
import type { NodeRow as NodeRowData, NodeView } from '@/graph/rows';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';

function textRowsOf(view: NodeView): NodeRowData[] {
  const texts = view.rows.filter(
    (row) => row.kind === 'widget' && row.multiline && row.target?.kind === 'node',
  );
  const shown = texts.filter((row) => !row.appInput);
  return shown.length > 0 ? shown : texts.slice(0, 1);
}

const cardFooter = cva('group/out relative flex items-start gap-1.5', {
  variants: { roomy: { false: 'py-1 pr-3 pl-1', true: 'py-2 pr-6 pl-2' } },
});

const footerChips = cva('flex min-w-0 flex-1 justify-end', {
  variants: {
    vertical: { false: 'flex-wrap items-center gap-1.5', true: 'flex-col items-end gap-1' },
  },
});

const insertAbove = cva('group/gap absolute inset-x-0 z-10 flex justify-center', {
  variants: {
    at: { gap: '-top-3 h-3 items-center', edge: 'top-0 h-2 items-start' },
  },
});

function InsertAbove({
  label,
  at,
  onInsert,
}: {
  readonly label: string;
  readonly at: 'gap' | 'edge';
  readonly onInsert: () => void;
}): React.ReactElement {
  return (
    <div className={insertAbove({ at })}>
      <AddNodeButton
        shown="hover"
        label={t('flow.card.insertAboveLabel', { name: label })}
        title={t('flow.card.insertAboveTitle')}
        onClick={onInsert}
        menuAction
      />
    </div>
  );
}

type CardBodyProps = Pick<
  NodeCardBodyProps,
  | 'view'
  | 'onCommit'
  | 'onNeedOptions'
  | 'onDisconnect'
  | 'onAddBefore'
  | 'onToggleAppInput'
  | 'onAddAfter'
> & {
  readonly anchors: AnchorRegistry | null;
  readonly bodyRef: React.Ref<HTMLDivElement>;
  readonly definitionsLoaded: boolean;
};

export function CardBody({
  view,
  anchors,
  bodyRef,
  definitionsLoaded,
  onCommit,
  onNeedOptions,
  onDisconnect,
  onAddBefore,
  onToggleAppInput,
  onAddAfter,
}: CardBodyProps): React.ReactElement {
  return (
    <div ref={bodyRef} className="pt-1">
      <BodyNote view={view} definitionsLoaded={definitionsLoaded} />

      {view.rows.length > 0 ? (
        <div ref={anchors?.register(bodyAnchorKey(view.id))}>
          {view.rows.map((row) => (
            <NodeRow
              key={row.name}
              nodeId={view.id}
              row={row}
              onCommit={onCommit}
              onNeedOptions={onNeedOptions}
              onDisconnect={onDisconnect}
              onAddBefore={onAddBefore}
              onToggleAppInput={onToggleAppInput}
            />
          ))}
        </div>
      ) : null}

      <CardFooter view={view} onAddAfter={onAddAfter} />
    </div>
  );
}

export function CardEdges({
  view,
  collapsed,
  onResizeText,
  onInsertAbove,
  insertAt,
}: Pick<NodeCardBodyProps, 'view' | 'onResizeText' | 'onInsertAbove'> & {
  readonly collapsed: boolean;
  readonly insertAt: NonNullable<NodeCardBodyProps['insertAt']>;
}): React.ReactElement {
  const onInsertClick = (): void => onInsertAbove?.(view.id);
  return (
    <>
      {collapsed || !onResizeText ? null : (
        <TextHeightHandle
          label={view.displayName}
          rows={textRowsOf(view)}
          onResizeText={onResizeText}
        />
      )}
      {onInsertAbove ? (
        <InsertAbove label={view.displayName} at={insertAt} onInsert={onInsertClick} />
      ) : null}
    </>
  );
}

function BodyNote({
  view,
  definitionsLoaded,
}: {
  readonly view: NodeView;
  readonly definitionsLoaded: boolean;
}): React.ReactElement | null {
  if (view.broken !== undefined) return null;
  if (view.kind === 'unknown') {
    if (!definitionsLoaded) return null;
    return (
      <p className="text-muted-foreground px-3 py-2 text-xs">
        {view.linked ? t('flow.card.missingDefinition') : t('flow.card.noServerDefinition')}
      </p>
    );
  }
  if (!view.unresolved) return null;
  return <p className="text-destructive px-3 py-2 text-xs">{t('flow.card.unresolved')}</p>;
}

function CardFooter({
  view,
  onAddAfter,
}: { readonly view: NodeView } & Pick<CardActions, 'onAddAfter'>): React.ReactElement | null {
  const anchors = useContext(AnchorContext);
  const { chipOutputs: vertical, roomy } = useContext(FlowLookContext);
  if (view.outputs.length === 0) return null;

  return (
    <div className={cardFooter({ roomy })}>
      <div className={footerChips({ vertical })}>
        <OutputChips view={view} onAddAfter={onAddAfter} />
        {vertical ? null : (
          <span
            ref={anchors?.register(outputAnchorKey(view.id))}
            className="size-2.5 shrink-0 rounded-full"
            style={anchorStyle(view)}
          />
        )}
      </div>
    </div>
  );
}
