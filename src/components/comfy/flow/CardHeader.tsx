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

// ─────────────────────────────
// カードの見出しの帯（取っ手・番号・名前・コメント・状態の印）
// ─────────────────────────────

/** 折りたたみ中の出力アンカー。出力が 1 つで見出しの行に置くときは、その行の高さに合わせる */
const collapsedAnchor = cva('absolute right-3 size-2.5 rounded-full', {
  variants: {
    inline: { true: 'top-1/2 -translate-y-1/2', false: 'bottom-2.5' },
  },
});

/** 見出しの帯（`color`）を混ぜる割合。本体より濃く見せる */
const HEADER_TINT = 50;

const OFF_HEADER_TINT = 12;

/**
 * 見出しの帯。取っ手と行のアプリ入力の印は同じ横位置に置くので、デモでも左は行と同じだけ増やす
 */
const cardHeader = cva('relative flex items-start gap-1 rounded-t-lg bg-muted tracking-tight', {
  variants: {
    roomy: { false: 'pt-1 pr-2 pb-[3px] pl-1.5', true: 'pt-2 pr-4 pb-1.5 pl-2.5' },
  },
});

/** 見出しの 1 行目。コメントを 2 行目に出すときは番号を 1 行目の高さに揃える（上揃え） */
const headerRow = cva('flex min-h-[25px] w-full gap-2', {
  variants: { below: { false: 'items-center', true: 'items-start' } },
});

/**
 * 見出しの番号。帯（既定の色も付けた色も）の上で読めるよう、カードの地を半ば透かして置く。
 * 上揃えのときは名前（14px・行 20px）の 1 行目の真ん中に来るよう少し下げる
 */
const indexBadge = cva(
  'bg-card/60 text-muted-foreground hover:bg-card mr-1 shrink-0 rounded px-1 text-2xs font-semibold tabular-nums',
  { variants: { below: { false: '', true: 'mt-0.5' } } },
);

/**
 * 見出しの名前とコメント。既定は横に並べ、デモはコメントを 2 行目に出す
 */
const titleBlock = cva('flex min-w-0 flex-1', {
  variants: {
    below: { false: 'items-baseline gap-2', true: 'flex-col items-start' },
  },
});

/** 名前。横に並べるときは見出しの半分まで（残りはコメントに譲る） */
const titleName = cva('shrink-0 truncate text-left text-sm font-[550] tracking-tighter', {
  variants: {
    below: { false: 'max-w-1/2', true: 'max-w-full' },
    // 無効（バイパス・ミュート）は取り消し線（変数パネルの生成元と同じ）
    off: { true: 'line-through', false: '' },
  },
});

/** 無効の札（見出しの名前の右）。番号と同じく帯の上で読めるようカードの地を半ば透かす */
const MODE_LABEL: Readonly<Partial<Record<number, MessageKey>>> = {
  [NODE_MODE.bypass]: 'flow.style.modeBypass',
  [NODE_MODE.mute]: 'flow.style.modeMute',
};

/** コメントの置き場。横に並べるときは包みを無いものとして扱う */
const commentSlot = cva('', {
  variants: { below: { false: 'contents', true: 'flex w-full min-w-0' } },
});

/**
 * 見出しの番号。押すとパラメータを畳む・広げる。開いている subgraph は、閉じて折りたたんだ
 * カードにする
 */
function IndexBadge({
  view,
  below,
  subgraphOpen,
  onCloseSubgraph,
  onToggleCollapsed,
}: {
  readonly view: NodeView;
  readonly below: boolean;
} & Pick<
  CardActions,
  'subgraphOpen' | 'onCloseSubgraph' | 'onToggleCollapsed'
>): React.ReactElement {
  const closing = subgraphOpen === true;
  const onBadgeClick = (): void => {
    if (closing) onCloseSubgraph?.(view.id);
    if (!closing || !view.collapsed) onToggleCollapsed?.(view.id);
  };
  return (
    <button
      type="button"
      className={indexBadge({ below })}
      {...MENU_ACTION}
      aria-expanded={!view.collapsed && !closing}
      aria-label={indexBadgeLabel(view, closing)}
      title={closing ? t('flow.subgraph.collapseTitle') : t('flow.card.toggleParamsTitle')}
      onClick={onBadgeClick}
    >
      {view.index}
    </button>
  );
}

/** 見出しの番号の読み上げ。開いている subgraph は閉じる、ほかはパラメータを畳む・広げる */
function indexBadgeLabel(view: NodeView, closing: boolean): string {
  const name = view.displayName;
  if (closing) return t('flow.subgraph.collapse', { name });
  return t(view.collapsed ? 'flow.card.showParams' : 'flow.card.hideParams', { name });
}

/**
 * 見出しの帯（取っ手・番号・名前・コメント・状態の印、折りたたみ中は出力も）
 */
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
  /** 見出しを折りたたみの見た目にする（閉じ終わってから切り替わる） */
  readonly collapsed: boolean;
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
  /**
   * 名前を Tab の止まる所にする（欄を 1 つも出していないカード）
   */
  readonly nameInTabOrder: boolean;
  /** 実行の状態（実行中・失敗は見出しに印を出す） */
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
  // 折りたたみ中で出力が 1 つだけなら、見出しの行の右端に置く（行を 1 つ減らす）
  const inlineOutput = collapsed && view.outputs.length === 1;
  const modeLabel = MODE_LABEL[view.mode];
  // Ctrl+Enter は選択に足す・外す（キーボードだけで複数を選べるように）
  const onNameKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onSelect?.(view.id, true);
  };

  return (
    // 付けた色は style が上書きする
    // 字間を詰めて横幅を抑える（Geist は字幅の軸を持たないので字間で調整する）
    <div
      className={cardHeader({ roomy })}
      style={tint(view.color, modeLabel === undefined ? HEADER_TINT : OFF_HEADER_TINT)}
    >
      {/* 開いた subgraph は、見出しの中央から点線を出して下へ曲げる */}
      {subgraphOpen === true ? <SubgraphHeadLine /> : null}
      {/* 箱（18px）は右の行（25px）と縦中央で揃える。見た目の釣り合いで 1px 上げる */}
      <button
        type="button"
        className="text-muted-foreground my-[3.5px] shrink-0 -translate-y-px
      cursor-grab rounded p-0.5"
        aria-label={t('flow.shared.reorder', { name: view.displayName })}
        data-card-grip
        {...attributes}
        {...listeners}
        // 基盤の付ける止まる所を打ち消し、メニューから届くようにする
        {...MENU_ACTION}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        {/* 25px の行にし、番号・名前・コメントを縦中央で揃える */}
        <div className={headerRow({ below })}>
          {view.index !== null ? (
            <IndexBadge
              view={view}
              below={below}
              subgraphOpen={subgraphOpen}
              onCloseSubgraph={onCloseSubgraph}
              onToggleCollapsed={onToggleCollapsed}
            />
          ) : null}
          {/* subgraph は番号の右に ▶ と印。どちらを押しても開く */}
          {view.kind === 'subgraph' ? (
            <SubgraphMark
              view={view}
              onOpenSubgraph={onOpenSubgraph}
              subgraphOpen={subgraphOpen}
              onCloseSubgraph={onCloseSubgraph}
              subgraphUses={subgraphUses}
            />
          ) : null}
          {/* 名前は見出し（出力チップを除く）の半分まで。残りはコメントに譲り、
              全文は指したときに出す。コメントは名前より小さいので下（ベースライン）で揃える */}
          <div className={titleBlock({ below })}>
            <button
              type="button"
              // 行（12px）より大きく、見出しとして読める程度に留める
              className={titleName({ below, off: modeLabel !== undefined })}
              {...(nameInTabOrder ? {} : MENU_ACTION)}
              // メニューでは押すと何が起きるかを言う（読み上げの名前はノード名のまま）
              data-menu-label={t('flow.card.selectLabel', { name: view.displayName })}
              title={view.displayName}
              onClick={() => onSelect?.(view.id)}
              onKeyDown={onNameKeyDown}
            >
              {view.displayName}
            </button>
            {/* 外部でコメントが変わったら作り直す（描画中の state 同期を避ける） */}
            <div className={commentSlot({ below })}>
              <CommentField key={view.comment} view={view} onCommentChange={onCommentChange} />
            </div>
          </div>
          {modeLabel === undefined ? null : (
            <span className="bg-card/60 text-muted-foreground shrink-0 rounded px-1 text-2xs font-semibold">
              {t(modeLabel)}
            </span>
          )}
          {/* 実行中・失敗は枠の色に加えて形でも見せる（WCAG 1.4.1）。読み上げはカードの先頭で渡す */}
          {renderStateIcon(state)}
          {inlineOutput ? (
            <div className="flex max-w-2/5 min-w-0 items-center pr-4">
              <OutputChips view={view} onAddAfter={onAddAfter} />
            </div>
          ) : null}
        </div>

        {/* 折りたたみ中は出力欄を見出しの下に寄せ、入力の終点もここに集約する */}
        {collapsed && view.outputs.length > 1 ? (
          <div className="flex min-w-0 items-center justify-end gap-1.5 pt-1 pr-4">
            <OutputChips view={view} onAddAfter={onAddAfter} />
          </div>
        ) : null}
      </div>

      {/* 折りたたみ中の出力アンカー。**展開時と同じ x**（カード右端から 12px）に置く */}
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

/**
 * subgraph の印（▶ と graph の印）。押すと開く。開いているときは ▼ で、
 * 押すとカードに戻す。開けない所（開いた中）では graph の印だけ
 */
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

/** 実行中・失敗の印（枠の色に加えて形でも見せる）。ふだんは出さない */
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
