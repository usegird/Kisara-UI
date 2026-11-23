import { PreviewCard } from '@base-ui/react/preview-card';
import { cva } from 'class-variance-authority';
import { Command } from 'cmdk';
import { ChevronRight } from 'lucide-react';

import { listButton } from '@/components/comfy/flow/dialogs/node-search-look';
import { NodeCardPreview } from '@/components/comfy/flow/NodeCard';
import { TREE_INDENT_BASE, TREE_INDENT_STEP } from '@/components/ui/directory-list';
import { previewNodeView } from '@/graph/node-preview';
import { slotSummary, topCategory, type CategoryNode } from '@/graph/search';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import { t } from '@/i18n';

const TYPE_TEXT_CLASS =
  'text-muted-foreground ml-auto min-w-0 shrink-[100] truncate text-right font-mono text-2xs';

const PREVIEW_DELAY = 300;

type CardPreviewHandle = PreviewCard.Handle<NodeDefinition>;

const PREVIEW_COLLISION = { side: 'flip', align: 'shift', fallbackAxisSide: 'none' } as const;

export function CardPreviewPopup({
  handle,
  definitions,
  anchor,
}: {
  readonly handle: CardPreviewHandle;
  readonly definitions: NodeDefinitionMap;
  readonly anchor: () => Element | null;
}): React.ReactElement {
  return (
    <PreviewCard.Root handle={handle}>
      {({ payload }) =>
        payload === undefined ? null : (
          <PreviewCard.Portal>
            <PreviewCard.Positioner
              side="right"
              align="start"
              sideOffset={8}
              anchor={anchor}
              collisionAvoidance={PREVIEW_COLLISION}
              className="z-[60]"
            >
              <PreviewCard.Popup className="rounded-lg shadow-lg outline-none">
                <SearchCardPreview definition={payload} definitions={definitions} />
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        )
      }
    </PreviewCard.Root>
  );
}

function SearchCardPreview({
  definition,
  definitions,
}: {
  readonly definition: NodeDefinition;
  readonly definitions: NodeDefinitionMap;
}): React.ReactElement | null {
  const view = previewNodeView(definition, definitions);
  return view === null ? null : <NodeCardPreview view={view} />;
}

export function NodeResult({
  definition,
  preview,
  onSelect,
}: {
  readonly definition: NodeDefinition;
  readonly preview: CardPreviewHandle;
  readonly onSelect: (definition: NodeDefinition) => void;
}): React.ReactElement {
  const { inputs, outputs } = slotSummary(definition);
  const description = definition.description ?? '';

  return (
    <Command.Item
      value={definition.name}
      onSelect={() => onSelect(definition)}
      className="data-[selected=true]:bg-accent cursor-pointer rounded"
    >
      <PreviewCard.Trigger
        handle={preview}
        payload={definition}
        delay={PREVIEW_DELAY}
        closeDelay={0}
        render={<span className="flex flex-col px-2 py-1.5" />}
      >
        <span className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="min-w-0 shrink-[0.01] truncate">{definition.displayName}</span>
          <span
            className="text-muted-foreground min-w-0 shrink-[10000] truncate text-xs"
            title={definition.category}
          >
            {topCategory(definition)}
          </span>
          <span
            className={TYPE_TEXT_CLASS}
            title={t('nodeSearch.result.inputs', { types: inputs || t('nodeSearch.result.none') })}
          >
            {inputs || '—'}
          </span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2 text-2xs">
          <span
            className="text-muted-foreground min-w-0 shrink-[10000] truncate"
            title={description || undefined}
          >
            {description}
          </span>
          <span
            className={TYPE_TEXT_CLASS}
            title={t('nodeSearch.result.outputs', {
              types: outputs || t('nodeSearch.result.none'),
            })}
          >
            {outputs || '—'}
          </span>
        </span>
      </PreviewCard.Trigger>
    </Command.Item>
  );
}

export function CategoryBranch({
  nodes,
  depth,
  selected,
  onSelect,
}: {
  readonly nodes: readonly CategoryNode[];
  readonly depth: number;
  readonly selected: string;
  readonly onSelect: (category: string) => void;
}): React.ReactElement {
  return (
    <>
      {nodes.map((node) => {
        const open = selected === node.key || selected.startsWith(`${node.key}/`);
        const hasChildren = node.children.length > 0;
        return (
          <div key={node.key}>
            <button
              type="button"
              className={listButton({ selected: selected === node.key })}
              style={{ paddingLeft: TREE_INDENT_BASE + depth * TREE_INDENT_STEP }}
              title={node.key}
              aria-pressed={selected === node.key}
              aria-expanded={hasChildren ? open : undefined}
              onClick={() => onSelect(node.key)}
            >
              <ChevronRight className={chevron({ open, shown: hasChildren })} aria-hidden />
              <span className="truncate">{node.label}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">{node.count}</span>
            </button>
            {open && hasChildren ? (
              <CategoryBranch
                nodes={node.children}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

const chevron = cva('size-3.5 shrink-0 transition-transform', {
  variants: {
    open: { true: 'rotate-90', false: '' },
    shown: { true: '', false: 'invisible' },
  },
});
