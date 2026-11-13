/* eslint-disable react-hooks/refs --
 * useSortable の戻り値（setNodeRef などを含む）がまるごと ref とみなされる誤検知。
 * 描画中に .current を読んではいない。
 */
import {
  DndContext,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { memo, useContext } from 'react';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { noLayoutAnimation } from '@/components/comfy/flow/flow-dnd';
import { CARD_MOTION, type MotionKind } from '@/components/comfy/flow/item-motion';
import { NodeCardContent, type NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { RenderProbe } from '@/components/ui/render-probe';
import { DRAGGING_Z_INDEX } from '@/components/ui/sortable-style';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { NodeRow as NodeRowData, NodeView } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// ノードカード。見出し・行・下端の欄と右クリックメニューを描き、dnd-kit で並べ替える。
// 出力チップ・コメント欄・メニューの実行モードと色は、それぞれ隣のファイルにある。
// ─────────────────────────────

/** カード 1 枚の枠（並べ替えの単位） */
const cardItem = cva('relative', {
  variants: {
    motion: CARD_MOTION,
  },
});

/** ノードカードの受け取り物。表示する中身と、カードから起こす操作の手続き */
export interface NodeCardProps {
  readonly view: NodeView;
  readonly state?: NodeCardState | undefined;
  /**
   * ノード定義が読み込めているか。未取得のときは全カードが「定義なし」になるので、
   * カードごとの注記は出さない（画面上部のバナーで1度だけ知らせる）。
   */
  readonly definitionsLoaded?: boolean | undefined;
  /**
   * 選ぶ。`additive`（Ctrl+クリック・Ctrl+Enter）なら選択に足す・外す
   */
  readonly onSelect?: ((id: number, additive?: boolean) => void) | undefined;
  /** 選んでいるカードか（右クリックメニューにグループ化を出す） */
  readonly selected?: boolean | undefined;
  readonly onCommentChange?: ((id: number, comment: string) => void) | undefined;
  readonly onCommit?: ((row: NodeRowData, value: unknown) => void) | undefined;
  /** 複数行の入力の高さを変える */
  readonly onResizeText?: ((row: NodeRowData, height: number) => void) | undefined;
  readonly onNeedOptions?: ((row: NodeRowData) => void) | undefined;
  /** 右クリックメニューの「詳細設定」 */
  readonly onOpenSettings?: ((id: number) => void) | undefined;
  /** 実行モード・枠色・背景色を変える（右クリックメニューから） */
  readonly onSettingsChange?: ((id: number, patch: NodeSettingsPatch) => void) | undefined;
  /** 右クリックメニューの「削除」。確かめるのは呼んだ側 */
  readonly onDelete?: ((id: number) => void) | undefined;
  /** 右クリックメニューの「クローン」。同じ内容のノードをすぐ後ろに足す */
  readonly onClone?: ((id: number) => void) | undefined;
  /** 右クリックメニューの「グループ化」。選んでいるカードのときだけ出す */
  readonly onGroup?: ((id: number) => void) | undefined;
  /** チップの × でリンクを解除する */
  readonly onDisconnect?: ((linkId: number) => void) | undefined;
  /** 出力チップの下の ▼ から、その出力の先にノードを足す */
  readonly onAddAfter?: ((id: number, slot: number, type: string) => void) | undefined;
  /** 行の三角から、その入力（パラメータを含む）の手前にノードを足す */
  readonly onAddBefore?: ((id: number, row: NodeRowData) => void) | undefined;
  /** パラメータ右端のアイコンで App Mode の対象を切り替える */
  readonly onToggleAppInput?: ((id: number, widgetName: string) => void) | undefined;
  /** 通番のクリックでパラメータの表示・非表示を切り替える（`flags.collapsed`） */
  readonly onToggleCollapsed?: ((id: number) => void) | undefined;
  /**
   * subgraph を開く。無ければ開く印を出さない
   */
  readonly onOpenSubgraph?: ((id: NodeId) => void) | undefined;
  /**
   * 開いている subgraph の見出しとして描く。行と下部を出さず（折りたたみと同じ見た目）、
   * ▶ を ▼ にして、押すとカードに戻す（`onCloseSubgraph`）
   */
  readonly subgraphOpen?: boolean | undefined;
  readonly onCloseSubgraph?: ((id: NodeId) => void) | undefined;
  /** 同じ定義を使うインスタンスの数（2 以上なら印の右に出す） */
  readonly subgraphUses?: number | undefined;
  /**
   * subgraph をグループに戻す。外の階層だけ。無ければ出さない
   */
  readonly onConvertSubgraph?: ((id: NodeId) => void) | undefined;
  /**
   * カードの上の隙間の ⊕。このカードの手前に繋がずに足す
   */
  readonly onInsertAbove?: ((id: NodeId) => void) | undefined;
  /** ⊕ を置く所。先頭のカードは上に隙間が無いので上端に重ねる */
  readonly insertAt?: 'gap' | 'edge' | undefined;
  /**
   * 足したばかりで右から滑り込ませる・消すので右へ抜けさせる
   */
  readonly motion?: MotionKind | undefined;
  /** 動きが終わった */
  readonly onMotionEnd?: ((id: NodeId) => void) | undefined;
}

/**
 * カードの外側。**掴む受け口と位置のずらしだけ**を持つ。
 * 掴んでいるカードは dnd-kit がポインタの動くたびに描き直し、並びのずらしが変わるカードも
 * 描き直すので、中身（`NodeCardBody`）は分けて、受け取り物が同じなら描き直さない
 */
export function NodeCard({
  motion = 'none',
  onMotionEnd,
  ...props
}: NodeCardProps): React.ReactElement {
  const { view } = props;
  const sortable = useSortable({
    id: view.id,
    data: { label: view.displayName },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  // ずらし量は画面の px で来るので、列の倍率で割り戻す
  const zoom = useContext(ColumnZoomContext);
  // 中の部品の動き（送りなど）の終わりは拾わない
  const onCardAnimationEnd = (event: React.AnimationEvent<HTMLLIElement>): void => {
    if (motion !== 'none' && event.target === event.currentTarget) onMotionEnd?.(view.id);
  };

  return (
    <li
      ref={sortable.setNodeRef}
      // ドラッグ中に指に付ける写しを作るとき、元の要素を引く鍵（useFlowDnd が読む）
      data-sort-id={view.id}
      // キーボードで開くメニューが、このカードの操作を集める範囲
      data-menu-scope={view.displayName}
      className={cardItem({ motion })}
      onAnimationEnd={onCardAnimationEnd}
      style={{
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? DRAGGING_Z_INDEX : undefined,
      }}
    >
      <NodeCardBody
        {...props}
        dragging={sortable.isDragging}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
      />
    </li>
  );
}

/** 見本の取っ手に渡す受け口（掴めない。見本は操作できない）。役割の名前は描くときに引く */
const PREVIEW_ATTRIBUTES: Omit<DraggableAttributes, 'aria-roledescription'> = {
  role: 'button',
  tabIndex: -1,
  'aria-disabled': true,
  'aria-pressed': undefined,
  'aria-describedby': '',
};

/**
 * ノードの追加で候補を指したときのカードの見本。値の欄は読み取りだけで、
 * 押しても何も起きない（`inert`）。描いた回数はカードの回数に数えない。
 * 線の測定と落とし先の受け口は画面のものと分ける（見本を測らない・落とし先にしない）
 */
export function NodeCardPreview({ view }: { readonly view: NodeView }): React.ReactElement {
  return (
    <AnchorContext.Provider value={null}>
      <DndContext>
        {/* 幅は画面のカードより細め（ダイアログの右の空きに入るように） */}
        <div inert className="w-72">
          <NodeCardContent
            view={view}
            dragging={false}
            attributes={{
              ...PREVIEW_ATTRIBUTES,
              'aria-roledescription': sortableAttributes().roleDescription,
            }}
            listeners={undefined}
          />
        </div>
      </DndContext>
    </AnchorContext.Provider>
  );
}

/** カードの中身の受け取り物。外側の受け取り物に、掴む受け口を足す */
export type NodeCardBodyProps = Omit<NodeCardProps, 'motion' | 'onMotionEnd'> & {
  /** 掴まれている（見た目を薄くする） */
  readonly dragging: boolean;
  /** 取っ手に付ける受け口（dnd-kit が覚えているものをそのまま渡す） */
  readonly attributes: DraggableAttributes;
  readonly listeners: DraggableSyntheticListeners;
};

/**
 * カードの中身。全カードで 1 つの名前に数える（回数がそのまま描き直したカードの枚数になる）。
 * 計測の範囲は比べる部品の内側に置く。
 * 外側の `NodeCard` は compiler が飛ばす（描画中に ref を読むとみなされる）ので、手で memo する
 */
const NodeCardBody = memo(function NodeCardBody(props: NodeCardBodyProps): React.ReactElement {
  return (
    <RenderProbe id="NodeCard">
      <NodeCardContent {...props} />
    </RenderProbe>
  );
});

/** カードの段（見出し・下端の欄・メニュー）へ渡す手続き */
export type CardActions = Pick<
  NodeCardProps,
  | 'onSelect'
  | 'onCommentChange'
  | 'onToggleCollapsed'
  | 'onAddAfter'
  | 'onOpenSettings'
  | 'onSettingsChange'
  | 'onClone'
  | 'onGroup'
  | 'onDelete'
  | 'onOpenSubgraph'
  | 'subgraphOpen'
  | 'onCloseSubgraph'
  | 'subgraphUses'
  | 'onConvertSubgraph'
>;
