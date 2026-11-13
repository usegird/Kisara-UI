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

// ─────────────────────────────
// カードの中身（見出し・注記・行・下端の欄・メニュー）と、カードの枠の見た目
// ─────────────────────────────

/** 無効のカード（バイパス・ミュート）の地の差し替え */
// 斜めの縞を敷く（下の地がグループの塗りでも、地の色に頼らず見分けられる）
const OFF_CARD = `[--card:transparent] [--color-card:transparent] [--muted:var(--off-band)]
  bg-[repeating-linear-gradient(135deg,var(--off-stripe)_0_6px,transparent_6px_12px)] shadow-none`;

// 状態の輪は**カードの内側**に、中身より前の層（::after）で描く。外に出すと、スクロールする列の
// 上端に付いた先頭のカードで上辺が切れる（余白を足さずに収める）。見出しの帯にも隠れない
const card = cva(
  `relative rounded-lg bg-card text-card-foreground shadow-sm transition-colors
    after:pointer-events-none after:absolute after:inset-0 after:z-[1] after:rounded-[inherit]
    after:ring-inset`,
  {
    variants: {
      // 待機中は外枠を引かない
      state: {
        idle: '',
        running: 'after:ring-2 after:ring-slot-conditioning',
        error: 'after:ring-2 after:ring-destructive',
        // 選択中は太く濃く（実行中・失敗の輪より目立たせる）
        selected: 'after:ring-[3px] after:ring-ring',
      },
      mode: {
        normal: '',
        // 無効（バイパス・ミュート。2 つは見分けなくてよい）は薄くせず（中の欄は編集できるので
        // 文字の明度差を保つ。WCAG 1.4.3）、本体の地を抜いて中抜きにし、見出しの帯も沈め、影も
        // 落とさない。名前の取り消し線と札も添える。色を付けたノードも混ぜる相手の
        // 地ごと替わる。中の部品は --card・--muted を引き、色の混ぜ（tint）は --color-card を引くので
        // 両方を替える
        bypass: OFF_CARD,
        mute: OFF_CARD,
      },
    },
    defaultVariants: { state: 'idle', mode: 'normal' },
  },
);

/** 状態の読み上げ（平常は読まない） */
const CARD_STATE_LABEL = {
  running: 'flow.card.state.running',
  error: 'flow.card.state.error',
  selected: 'flow.card.state.selected',
} as const satisfies Record<Exclude<NodeCardState, 'idle'>, MessageKey>;

/** 測定の仕組みが無いとき（単体の表示）の代わり */
const NO_REMEASURE = (): void => {};

/** 並べ替えの取っ手の上（押しても選び直さない） */
function isCardGrip(target: Element): boolean {
  return target.closest('[data-card-grip]') !== null;
}

/** カードの本体の幅と、運んでいる間に元の場所へ残す薄い影 */
const cardBody = cva('w-full', {
  variants: { dragging: { true: 'opacity-40', false: '' } },
});

/** カードの状態の輪（待機・実行中・失敗・選択中） */
export type NodeCardState = NonNullable<VariantProps<typeof card>['state']>;

function modeVariant(mode: number): NonNullable<VariantProps<typeof card>['mode']> {
  if (mode === NODE_MODE.bypass) return 'bypass';
  if (mode === NODE_MODE.mute) return 'mute';
  return 'normal';
}

/** 本体（`bgcolor`）を混ぜる割合 */
const BODY_TINT = 30;

/** 無効（バイパス・ミュート）のカードで混ぜる割合。地に寄せて沈める */
const OFF_BODY_TINT = 8;

/**
 * カードの中身（見出し・注記・行・下端の欄・メニュー）
 */
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
  // 折りたたみは本体を上下に開閉する。見出しの見た目は閉じ終わってから切り替える
  // 開いている subgraph は見出しだけ（中のカードは下に字下げして並ぶ）
  const collapsed = view.collapsed || subgraphOpen;
  const fold = useCollapseMotion(collapsed, anchors?.remeasure ?? NO_REMEASURE);
  const picker = useColorPicker(view.id, onSettingsChange);
  const keyboardMenu = useKeyboardMenu();
  // 欄を 1 つも出していなければ、名前を Tab の止まる所に残す
  const hasField = !collapsed && onCommit !== undefined && hasEditableRow(view);

  // 文字を打つ欄の上ではブラウザ本来のメニュー（貼り付けなど）を出す。
  // キーボードから開いたときは、欄の上でも行とカードの操作を並べたメニューを出す
  // カードの外へ描いた部品（ダイアログなど。React では伝わってくる）の右クリックは、
  // カードのメニューを開かずブラウザ本来のメニューに任せる
  const onCardContextMenuCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) {
      event.stopPropagation();
      return;
    }
    const keyboard = keyboardMenu.take(event) !== null;
    if (!keyboard && isTextEntry(event.target)) event.stopPropagation();
  };
  // Ctrl+クリック（Mac は ⌘）はカードのどこでも選択に足す・外す。
  // 中のボタンや欄の操作より先に取り、そちらは動かさない
  const onCardClickCapture = (event: React.MouseEvent<HTMLElement>): void => {
    if (!(event.ctrlKey || event.metaKey) || !onSelect || isTextEntry(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(view.id, true);
  };
  // **押した時点で**カードのどこでも選ぶ（見出しに限らない）。
  // 押すと開く部品（選択肢など）は、離したときの click が開いた先に届いて
  // カードまで来ない。取っ手は除く（選んだカードをまとめたまま掴めるように）
  const onCardPointerDownCapture = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || !onSelect) return;
    if (!(event.target instanceof Element) || isCardGrip(event.target)) return;
    if (event.currentTarget.contains(event.target)) onSelect(view.id);
  };
  // キーボードで押したボタン（Enter）でも選ぶ。中の入力欄やボタンの操作はそのまま効かせる。
  // ダイアログなどカードの外へ描いた部品のクリック（React では伝わってくる）は数えない
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
            // メニューキー・Shift+F10 を覚えておく（キーボードから開いたメニューを見分ける）
            onKeyDownCapture={keyboardMenu.onKeyDownCapture}
            onContextMenuCapture={onCardContextMenuCapture}
            onClickCapture={onCardClickCapture}
            onPointerDownCapture={onCardPointerDownCapture}
            onClick={onCardClick}
          >
            {/* 枠の色で見せている状態を読み上げにも渡す（WCAG 1.4.1・1.3.1） */}
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

            {/* 読めない形のノード。理由だけを出す（ワークフローからは消さない） */}
            {renderBrokenNote(view)}
            {/* 本体（注記・行・下部の欄）。折りたたみで上下に開閉する */}
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

/** 枠の色で見せている状態の読み上げ。ふだんは出さない */
function renderStateNote(state: NodeCardState): React.ReactElement | null {
  if (state === 'idle') return null;
  return <span className="sr-only">{t(CARD_STATE_LABEL[state])}</span>;
}

/** 読めない形のノードの理由。読めていれば出さない */
function renderBrokenNote(view: NodeView): React.ReactElement | null {
  if (view.broken === undefined) return null;
  return (
    <p role="alert" className="text-destructive px-3 py-2 text-xs break-all">
      {t('flow.card.broken', { reason: view.broken })}
    </p>
  );
}

/** 欄を出しているか（アプリ入力へ移した行と、繋ぐ先の無い行は欄を出さない） */
function hasEditableRow(view: NodeView): boolean {
  return view.rows.some((row) => row.kind === 'widget' && !row.appInput && row.target !== null);
}

/** カードの読み上げの名前。コメントがあれば括弧で添える */
function cardLabelOf(view: NodeView): string {
  return view.comment ? `${view.displayName}（${view.comment}）` : view.displayName;
}
