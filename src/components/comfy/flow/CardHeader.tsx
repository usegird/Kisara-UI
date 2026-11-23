import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';
import { Boxes, ChevronDown, ChevronRight, CircleAlert, GripVertical, Loader2 } from 'lucide-react';
import { useContext } from 'react';

import { AnchorContext, outputAnchorKey } from '@/components/comfy/flow/anchor-context';
import { anchorStyle, tint } from '@/components/comfy/flow/card-style';
import { OutputChips } from '@/components/comfy/flow/CardOutputChips';
import { CommentField } from '@/components/comfy/flow/CommentField';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import type { CardActions } from '@/components/comfy/flow/NodeCard';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { SubgraphHeadLine } from '@/components/comfy/flow/SubgraphBranch';
import type { NodeView } from '@/graph/rows';
import { NODE_MODE } from '@/graph/types';
import { t, type MessageKey } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';

const collapsedAnchor = cva('absolute right-3 size-2.5 rounded-full', {
  variants: {
    inline: { true: 'top-1/2 -translate-y-1/2', false: 'bottom-2.5' },
  },
});

const HEADER_TINT = 50;

const OFF_HEADER_TINT = 12;

const cardHeader = cva('relative flex items-start gap-1 rounded-t-lg bg-muted tracking-tight', {
  variants: {
    roomy: { false: 'pt-1 pr-2 pb-[3px] pl-1.5', true: 'pt-2 pr-4 pb-1.5 pl-2.5' },
  },
});

const headerRow = cva('flex min-h-[25px] w-full gap-2', {
  variants: { below: { false: 'items-center', true: 'items-start' } },
});

const indexBadge = cva(
  'bg-card/60 text-muted-foreground hover:bg-card mr-1 shrink-0 rounded px-1 text-2xs font-semibold tabular-nums',
  { variants: { below: { false: '', true: 'mt-0.5' } } },
);

const titleBlock = cva('flex min-w-0 flex-1', {
  variants: {
    below: { false: 'items-baseline gap-2', true: 'flex-col items-start' },
  },
});

const titleName = cva('shrink-0 truncate text-left text-sm font-[550] tracking-tighter', {
  variants: {
    below: { false: 'max-w-1/2', true: 'max-w-full' },
    off: { true: 'line-through', false: '' },
  },
});

const MODE_LABEL: Readonly<Partial<Record<number, MessageKey>>> = {
  [NODE_MODE.bypass]: 'flow.style.modeBypass',
  [NODE_MODE.mute]: 'flow.style.modeMute',
};

const commentSlot = cva('', {
  variants: { below: { false: 'contents', true: 'flex w-full min-w-0' } },
});

function IndexBadge({
  view,
  below,
  onToggleCollapsed,
}: {
  readonly view: NodeView;
  readonly below: boolean;
} & Pick<CardActions, 'onToggleCollapsed'>): React.ReactElement {
  const name = view.displayName;
  return (
    <button
      type="button"
      className={indexBadge({ below })}
      {...MENU_ACTION}
      aria-expanded={!view.collapsed}
      aria-label={t(view.collapsed ? 'flow.card.showParams' : 'flow.card.hideParams', { name })}
      title={t('flow.card.toggleParamsTitle')}
      onClick={() => onToggleCollapsed?.(view.id)}
    >
      {view.index}
    </button>
  );
}

export function CardHeader({
  view,
  collapsed,
  attributes,
  listeners,
  nameInTabOrder,
  state,
  onSelect,
  onCommentChange,
  onToggleCollapsed,
  onAddAfter,
  onOpenSubgraph,
  subgraphOpen,
  onCloseSubgraph,
  subgraphUses,
}: {
  readonly view: NodeView;
  readonly collapsed: boolean;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
  readonly nameInTabOrder: boolean;
  readonly state: NodeCardState;
} & Pick<
  CardActions,
  | 'onSelect'
  | 'onCommentChange'
  | 'onToggleCollapsed'
  | 'onAddAfter'
  | 'onOpenSubgraph'
  | 'subgraphOpen'
  | 'onCloseSubgraph'
  | 'subgraphUses'
>): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const { commentBelow: below, roomy } = useContext(FlowLookContext);
  const chips = subgraphOpen !== true;
  const inlineOutput = chips && collapsed && view.outputs.length === 1;
  const modeLabel = MODE_LABEL[view.mode];
  const onNameKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onSelect?.(view.id, true);
  };

  return (
    <div
      className={cardHeader({ roomy })}
      style={tint(view.color, modeLabel === undefined ? HEADER_TINT : OFF_HEADER_TINT)}
    >
      {subgraphOpen === true ? <SubgraphHeadLine /> : null}
      <button
        type="button"
        className="text-muted-foreground my-[3.5px] shrink-0 -translate-y-px
      cursor-grab rounded p-0.5"
        aria-label={t('flow.shared.reorder', { name: view.displayName })}
        data-card-grip
        {...attributes}
        {...listeners}
        {...MENU_ACTION}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className={headerRow({ below })}>
          {view.index !== null ? (
            <IndexBadge view={view} below={below} onToggleCollapsed={onToggleCollapsed} />
          ) : null}
          {view.kind === 'subgraph' ? (
            <SubgraphMark
              view={view}
              onOpenSubgraph={onOpenSubgraph}
              subgraphOpen={subgraphOpen}
              onCloseSubgraph={onCloseSubgraph}
              subgraphUses={subgraphUses}
            />
          ) : null}
          <div className={titleBlock({ below })}>
            <button
              type="button"
              className={titleName({ below, off: modeLabel !== undefined })}
              {...(nameInTabOrder ? {} : MENU_ACTION)}
              data-menu-label={t('flow.card.selectLabel', { name: view.displayName })}
              title={view.displayName}
              onClick={() => onSelect?.(view.id)}
              onKeyDown={onNameKeyDown}
            >
              {view.displayName}
            </button>
            <div className={commentSlot({ below })}>
              <CommentField key={view.comment} view={view} onCommentChange={onCommentChange} />
            </div>
          </div>
          {modeLabel === undefined ? null : (
            <span className="bg-card/60 text-muted-foreground shrink-0 rounded px-1 text-2xs font-semibold">
              {t(modeLabel)}
            </span>
          )}
          {renderStateIcon(state)}
          {inlineOutput ? (
            <div className="flex max-w-2/5 min-w-0 items-center pr-4">
              <OutputChips view={view} onAddAfter={onAddAfter} />
            </div>
          ) : null}
        </div>

        {chips && collapsed && view.outputs.length > 1 ? (
          <div className="flex min-w-0 items-center justify-end gap-1.5 pt-1 pr-4">
            <OutputChips view={view} onAddAfter={onAddAfter} />
          </div>
        ) : null}
      </div>

      {collapsed ? (
        <span
          ref={anchors?.register(outputAnchorKey(view.id))}
          className={collapsedAnchor({ inline: inlineOutput })}
          style={anchorStyle(view)}
        />
      ) : null}
    </div>
  );
}

function SubgraphMark({
  view,
  onOpenSubgraph,
  subgraphOpen,
  onCloseSubgraph,
  subgraphUses,
}: { readonly view: NodeView } & Pick<
  CardActions,
  'onOpenSubgraph' | 'subgraphOpen' | 'onCloseSubgraph' | 'subgraphUses'
>): React.ReactElement {
  const uses =
    subgraphUses !== undefined && subgraphUses > 1 ? (
      <span
        className="text-muted-foreground shrink-0 text-2xs tabular-nums"
        title={t('flow.subgraph.usesTitle', { count: String(subgraphUses) })}
      >
        {t('flow.subgraph.uses', { count: String(subgraphUses) })}
      </span>
    ) : null;
  if (subgraphOpen === true && onCloseSubgraph) {
    return (
      <>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-card -ml-1.5 flex
            shrink-0 items-center gap-0.5 rounded px-0.5"
          {...MENU_ACTION}
          aria-expanded
          aria-label={t('flow.subgraph.close', { name: view.displayName })}
          title={t('flow.subgraph.closeTitle')}
          onClick={() => onCloseSubgraph(view.id)}
        >
          <ChevronDown className="size-3.5" aria-hidden />
          <Boxes className="size-3.5" aria-hidden />
        </button>
        {uses}
      </>
    );
  }
  if (!onOpenSubgraph) {
    return (
      <span className="text-muted-foreground shrink-0" title={t('flow.subgraph.mark')}>
        <Boxes className="size-3.5" aria-label={t('flow.subgraph.mark')} />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-card -ml-1.5 flex shrink-0
        items-center gap-0.5 rounded px-0.5"
      {...MENU_ACTION}
      aria-expanded={false}
      aria-label={t('flow.subgraph.open', { name: view.displayName })}
      title={t('flow.subgraph.openTitle')}
      onClick={() => onOpenSubgraph(view.id)}
    >
      <ChevronRight className="size-3.5" aria-hidden />
      <Boxes className="size-3.5" aria-hidden />
    </button>
  );
}

function renderStateIcon(state: NodeCardState): React.ReactElement | null {
  if (state === 'running') {
    return (
      <Loader2
        className="text-muted-foreground size-3.5 shrink-0 motion-safe:animate-spin"
        aria-hidden
      />
    );
  }
  if (state === 'error') {
    return <CircleAlert className="text-destructive size-3.5 shrink-0" aria-hidden />;
  }
  return null;
}
