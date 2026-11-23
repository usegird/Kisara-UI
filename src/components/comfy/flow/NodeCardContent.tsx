import { cva, type VariantProps } from 'class-variance-authority';
import { useContext } from 'react';

import { AnchorContext, cardAnchorKey } from '@/components/comfy/flow/anchor-context';
import { tint } from '@/components/comfy/flow/card-style';
import { CardBody, CardEdges } from '@/components/comfy/flow/CardBody';
import { CardHeader } from '@/components/comfy/flow/CardHeader';
import { CardMenu } from '@/components/comfy/flow/CardMenu';
import type { NodeCardBodyProps } from '@/components/comfy/flow/NodeCard';
import { useColorPicker } from '@/components/comfy/flow/use-color-picker';
import { ContextMenuRoot, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { NodeView } from '@/graph/rows';
import { NODE_MODE } from '@/graph/types';
import { useCollapseMotion } from '@/hooks/flow/use-flow-motion';
import { useKeyboardMenu } from '@/hooks/ui/use-keyboard-menu';
import { t, type MessageKey } from '@/i18n';
import { isTextEntry } from '@/lib/text-entry';
import { cn } from '@/lib/utils';

const OFF_CARD = `[--card:transparent] [--color-card:transparent] [--muted:var(--off-band)]
  bg-[repeating-linear-gradient(135deg,var(--off-stripe)_0_6px,transparent_6px_12px)] shadow-none`;

const card = cva(
  `relative rounded-lg bg-card text-card-foreground shadow-sm transition-colors
    after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:rounded-[inherit]
    after:ring-inset`,
  {
    variants: {
      state: {
        idle: '',
        running: 'after:ring-2 after:ring-slot-conditioning',
        error: 'after:ring-2 after:ring-destructive',
        selected: 'after:ring-[3px] after:ring-ring',
      },
      mode: {
        normal: '',
        bypass: OFF_CARD,
        mute: OFF_CARD,
      },
    },
    defaultVariants: { state: 'idle', mode: 'normal' },
  },
);

const CARD_STATE_LABEL = {
  running: 'flow.card.state.running',
  error: 'flow.card.state.error',
  selected: 'flow.card.state.selected',
} as const satisfies Record<Exclude<NodeCardState, 'idle'>, MessageKey>;

const NO_REMEASURE = (): void => {};

function isCardGrip(target: Element): boolean {
  return target.closest('[data-card-grip]') !== null;
}

const cardBody = cva('w-full', {
  variants: { dragging: { true: 'opacity-40', false: '' } },
});

export type NodeCardState = NonNullable<VariantProps<typeof card>['state']>;

function modeVariant(mode: number): NonNullable<VariantProps<typeof card>['mode']> {
  if (mode === NODE_MODE.bypass) return 'bypass';
  if (mode === NODE_MODE.mute) return 'mute';
  return 'normal';
}

const BODY_TINT = 30;

const OFF_BODY_TINT = 8;

export function NodeCardContent({
  view,
  state = 'idle',
  definitionsLoaded = true,
  onSelect,
  onCommentChange,
  onCommit,
  onResizeText,
  onNeedOptions,
  onOpenSettings,
  onDelete,
  onClone,
  onGroup,
  selected = false,
  onSettingsChange,
  onDisconnect,
  onAddAfter,
  onAddBefore,
  onToggleAppInput,
  onToggleCollapsed,
  onOpenSubgraph,
  subgraphOpen = false,
  onCloseSubgraph,
  subgraphUses,
  onConvertSubgraph,
  onInsertAbove,
  insertAt = 'gap',
  dragging,
  attributes,
  listeners,
}: NodeCardBodyProps): React.ReactElement {
  const mode = modeVariant(view.mode);
  const anchors = useContext(AnchorContext);
  const collapsed = view.collapsed || subgraphOpen;
  const fold = useCollapseMotion(collapsed, anchors?.remeasure ?? NO_REMEASURE);
  const picker = useColorPicker(view.id, onSettingsChange);
  const keyboardMenu = useKeyboardMenu();
  const hasField = !collapsed && onCommit !== undefined && hasEditableRow(view);

  const onCardContextMenuCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      event.stopPropagation();
      return;
    }
    const keyboard = keyboardMenu.take(event) !== null;
    if (!keyboard && isTextEntry(event.target)) event.stopPropagation();
  };
  const onCardClickCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (!(event.ctrlKey || event.metaKey) || !onSelect || isTextEntry(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(view.id, true);
  };
  const onCardPointerDownCapture = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || !onSelect) return;
    if (!(event.target instanceof Element) || isCardGrip(event.target)) return;
    if (event.currentTarget.contains(event.target)) onSelect(view.id);
  };
  const onCardClick = (event: React.MouseEvent<HTMLElement>): void => {
    if (!onSelect || !(event.target instanceof Node)) return;
    if (event.currentTarget.contains(event.target)) onSelect(view.id);
  };

  return (
    <>
      <ContextMenuRoot>
        <ContextMenuTrigger className="block">
          <article
            ref={anchors?.register(cardAnchorKey(view.id))}
            className={cn(card({ state, mode }), cardBody({ dragging }))}
            style={tint(view.bgcolor, mode === 'normal' ? BODY_TINT : OFF_BODY_TINT)}
            aria-label={cardLabelOf(view)}
            onKeyDownCapture={keyboardMenu.onKeyDownCapture}
            onContextMenuCapture={onCardContextMenuCapture}
            onClickCapture={onCardClickCapture}
            onPointerDownCapture={onCardPointerDownCapture}
            onClick={onCardClick}
          >
            {renderStateNote(state)}
            <CardHeader
              view={view}
              collapsed={fold.headerCollapsed}
              attributes={attributes}
              listeners={listeners}
              nameInTabOrder={!hasField}
              state={state}
              onSelect={onSelect}
              onCommentChange={onCommentChange}
              onToggleCollapsed={onToggleCollapsed}
              onAddAfter={onAddAfter}
              onOpenSubgraph={onOpenSubgraph}
              subgraphOpen={subgraphOpen}
              onCloseSubgraph={onCloseSubgraph}
              subgraphUses={subgraphUses}
            />

            {renderBrokenNote(view)}
            {fold.bodyShown ? (
              <CardBody
                view={view}
                anchors={anchors}
                bodyRef={fold.bodyRef}
                definitionsLoaded={definitionsLoaded}
                onCommit={onCommit}
                onNeedOptions={onNeedOptions}
                onDisconnect={onDisconnect}
                onAddBefore={onAddBefore}
                onToggleAppInput={onToggleAppInput}
                onAddAfter={onAddAfter}
              />
            ) : null}
          </article>
        </ContextMenuTrigger>

        <CardMenu
          view={view}
          keyboardMenu={keyboardMenu}
          onSelect={onSelect}
          onOpenSettings={onOpenSettings}
          onSettingsChange={onSettingsChange}
          onPickColor={picker.open}
          onClone={onClone}
          onGroup={selected ? onGroup : undefined}
          onDelete={onDelete}
          onOpenSubgraph={onOpenSubgraph}
          subgraphOpen={subgraphOpen}
          onCloseSubgraph={onCloseSubgraph}
          onConvertSubgraph={onConvertSubgraph}
        />
      </ContextMenuRoot>
      {picker.input}
      <CardEdges
        view={view}
        collapsed={collapsed}
        onResizeText={onResizeText}
        onInsertAbove={onInsertAbove}
        insertAt={insertAt}
      />
    </>
  );
}

function renderStateNote(state: NodeCardState): React.ReactElement | null {
  if (state === 'idle') return null;
  return <span className="sr-only">{t(CARD_STATE_LABEL[state])}</span>;
}

function renderBrokenNote(view: NodeView): React.ReactElement | null {
  if (view.broken === undefined) return null;
  return (
    <p role="alert" className="text-destructive px-3 py-2 text-xs break-all">
      {t('flow.card.broken', { reason: view.broken })}
    </p>
  );
}

function hasEditableRow(view: NodeView): boolean {
  return view.rows.some((row) => row.kind === 'widget' && !row.appInput && row.target !== null);
}

function cardLabelOf(view: NodeView): string {
  return view.comment ? `${view.displayName}（${view.comment}）` : view.displayName;
}
