import { cva } from 'class-variance-authority';
import { useContext } from 'react';

import {
  AnchorContext,
  APP_VIEWPORT_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { AppInputPanel } from '@/components/comfy/flow/AppInputPanel';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import { APP_ICON_GAP } from '@/components/comfy/flow/flow-canvas-values';
import { CARD_COLUMN_PADDING_LEFT } from '@/components/comfy/flow/group-frame-look';
import { GroupSwitchPanel } from '@/components/comfy/flow/GroupSwitchPanel';
import { HiddenNodeToggles } from '@/components/comfy/flow/HiddenNodeToggles';
import { InsertBar } from '@/components/comfy/flow/InsertBar';
import { SortByProcessingButton } from '@/components/comfy/flow/SortByProcessingButton';
import { ColumnDivider, type ColumnDividerProps } from '@/components/ui/column-divider';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import type { AppInputColumn as AppInputColumnData } from '@/hooks/flow/use-app-input-column';
import type { NodeEditing } from '@/hooks/flow/use-node-editing';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// ワークフロー画面の列。中身の部品は呼ぶ側が組み立て、ここは送りの枠と脇のアイコンと境目を持つ
// ─────────────────────────────

/**
 * アプリ入力の列の仕切りを、見た目だけ左へ寄せる量。線を**列の右端から 5px**（脇のアイコンの左端）に
 * 置く（列は見た目で 9px 左にあり、仕切りとの間には列の間隔 gap-4 が入る。線は掴める幅の左端）。
 * カードの列と同じく、重なりはアイコンを上にする
 */
const APP_DIVIDER_OFFSET = -16;

/**
 * アプリ入力とカードの間の仕切りを、見た目だけ寄せる量。線がカードの左 16px に来るように置く
 * （変数の左の線から変数の枠までと同じ。仕切りとカードの間には列の間隔 gap-4 が入る）。
 * カードは列の左端からグループの枠の余白のぶん内側にあるので、使うときはその余白を足す
 */
const APP_GAP_DIVIDER_OFFSET = 2;

/**
 * アプリ入力の列の送りの枠。送りのバーは左に出す（向きを右から左にして、中身で元に戻す）。
 * Safari は向きに従わず右に出ることがある。横は出さない
 * （枠の滑り込みで一瞬横の送りが出ないように）
 */
const appScroll = cva('min-w-0 flex-1 overflow-x-hidden overflow-y-auto', {
  variants: {
    left: { true: '[direction:rtl]', false: '' },
    // 狭い画面では、高さは中身と見えている高さの低いほう（底を下限に合わせ、余りを作らない）。
    // 横に払った動きは外の面へ渡す。上に余白を足さない（列の上端は 8px の基準線）
    narrow: {
      true: 'max-h-[100cqh] overscroll-y-contain',
      false: 'h-full overscroll-contain',
    },
  },
});

/**
 * カードの列の送りの枠。狭い画面では列で送らない。
 * 上に余白を足さない（列の上端は 8px の基準線）。
 * 変数の列も同じ（`VARIABLE_PANEL_METRICS.COLUMN_TOP_PADDING`）
 */
// 掴んでいる間はスクロール固定を切る。置き直しのたびにブラウザが scrollTop を動かすと、スクロール量を足して
// 返す留めた位置がずれて指す先が変わり、置き直しと往復して更新の入れ子の上限で落ちる
const cardScroll = cva('in-data-dragging:[overflow-anchor:none]', {
  variants: {
    sheet: {
      true: '',
      false: 'h-full overflow-x-hidden overflow-y-auto overscroll-contain',
    },
  },
});

/**
 * 狭い画面の線を通す余白。列の間の間隔（gap-4）に足す。
 * 変数の左は、列の間の間隔と合わせてカードどうしを直結する弧（幅 50px ほど）が通る幅
 */
const NARROW_APP_GAP = 40;

/**
 * 狭い画面の列の幅（`cqw` は送る枠の幅）
 */
const NARROW_COLUMN_WIDTH = 'w-[calc(100cqw-2rem)]';

/** 狭い画面のアプリ入力の列の幅 */
const NARROW_APP_WIDTH = 'w-[calc((100cqw-2rem)*0.9)]';

/**
 * 狭い画面での列の出し方。横に並べるときは幅を設定から取り、列が自分で縦に送る。
 * 狭い画面では 3 列とも中身の高さのまま並べ、1 枚の面として縦にも横にも送る
 */
const columnFrame = cva('shrink-0', {
  variants: {
    narrow: { true: '', false: 'relative h-full' },
    shift: { true: '', false: '' },
  },
  compoundVariants: [
    // アプリ入力の列は横に並べるときだけ見た目で 9px 左へ寄せる
    { narrow: false, shift: true, className: '-left-[9px] flex' },
    // 狭い画面のアプリ入力の列は、面を縦に送っても見えている高さに留まり、列の中で送る
    { narrow: true, shift: true, className: ['sticky top-0 flex', NARROW_APP_WIDTH] },
    { narrow: true, shift: false, className: ['relative', NARROW_COLUMN_WIDTH] },
  ],
  defaultVariants: { shift: false },
});

/**
 * 左: App Mode 対象。編集の入口はここだけ（カード側は読み取り専用）。
 * 並びは動かさず、見た目だけ 9px 左へ寄せる。右脇に差し込みのアイコンを縦に並べる
 */
export function AppInputColumn({
  narrow,
  width,
  zoom,
  attachScroll,
  resetKey,
  appInputs,
  onNeedOptions,
  insertBar,
  scrollbarLeft,
}: {
  readonly width: number;
  readonly zoom: number;
  readonly attachScroll: (element: HTMLDivElement | null) => void;
  readonly resetKey: unknown;
  readonly appInputs: AppInputColumnData;
  readonly onNeedOptions: NodeEditing['needOptions'];
  readonly insertBar: boolean;
  readonly scrollbarLeft: boolean;
  readonly narrow: boolean;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const setTitle = useGraphStore((state) => state.setTitle);
  const setAppInputSpan = useGraphStore((state) => state.setAppInputSpan);
  const setAppInputHeight = useGraphStore((state) => state.setAppInputHeight);

  return (
    <div className={columnFrame({ narrow, shift: true })} style={narrow ? undefined : { width }}>
      <div
        data-app-scroll
        ref={(element) => {
          attachScroll(element);
          anchors?.register(APP_VIEWPORT_ANCHOR_KEY)(element);
        }}
        // 送りのバーの置き場は appScroll に書いてある
        // 狭い画面は送りのバーを出さないので向きも変えない
        className={appScroll({ left: scrollbarLeft && !narrow, narrow })}
      >
        <div className="[direction:ltr]" style={{ zoom }}>
          {/* 列ごとに受け止める。ワークフローが変わったら作り直す */}
          <ErrorBoundary label={t('flow.canvas.appColumn')} resetKey={resetKey}>
            <ColumnZoomContext.Provider value={zoom}>
              <GroupSwitchPanel />
              <AppInputPanel
                groups={appInputs.groups}
                spans={appInputs.spans}
                heights={appInputs.heights}
                onNeedOptions={onNeedOptions}
                onResize={setAppInputSpan}
                onCommentChange={setTitle}
                onResizeHeight={setAppInputHeight}
                onRemoveGroup={appInputs.removeGroup}
                enteringKey={appInputs.groupMotion.entering}
                leavingKey={appInputs.groupMotion.leaving}
                onMotionEnd={appInputs.groupMotion.finish}
                enteringField={appInputs.fieldMotion.entering}
                leavingField={appInputs.fieldMotion.leaving}
                onFieldMotionEnd={appInputs.fieldMotion.finish}
              />
            </ColumnZoomContext.Provider>
          </ErrorBoundary>
        </div>
      </div>
      {/* カードの右脇・最上部。カード列の脇のアイコンと同じ置き方
          （列の右端から 5px。境目より上に置き、重なったところはアイコンを優先する）。
          上は列の中身の上端に揃える。大きさは列の倍率に合わせ、右へ広がる */}
      {/* 狭い画面では差し込みのアイコンを出さない */}
      {insertBar && !narrow ? (
        <div className="absolute top-0 left-full z-20" style={{ marginLeft: APP_ICON_GAP }}>
          <div style={{ zoom }}>
            <InsertBar />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 中: カード列。見えている範囲の基準もここ（線を引く／引かないの判定に使う） */
export function CardColumn({
  narrow,
  width,
  zoom,
  attachScroll,
  tools,
  children,
}: {
  readonly narrow: boolean;
  readonly width: number;
  readonly zoom: number;
  readonly attachScroll: (element: HTMLDivElement | null) => void;
  readonly tools: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const anchors = useContext(AnchorContext);
  return (
    <div className={columnFrame({ narrow })} style={narrow ? undefined : { width }}>
      <div
        data-flow-scroll
        ref={(element) => {
          attachScroll(element);
          if (!narrow) anchors?.register(VIEWPORT_ANCHOR_KEY)(element);
        }}
        // 上端はアプリ入力・変数の列と同じ作り（基準線から始め、上へ伸ばさない）。
        // 先頭のカードの上の ⊕ はカードの上端に重ねる（NodeCard）。
        // 横は出さない（カードの滑り込みで一瞬横の送りが出ないように）
        className={cardScroll({ sheet: narrow })}
      >
        <div style={{ zoom }}>
          <ColumnZoomContext.Provider value={zoom}>{children}</ColumnZoomContext.Provider>
        </div>
      </div>
      {/* カードの右脇・最上部。スクロールバーに重ならない位置に置く。
          カードの幅の境目より上（z-20）に置き、重なったところはアイコンを優先する。
          上は列の中身の上端に揃える。大きさは列の倍率に合わせ、右へ広がる */}
      {/* 狭い画面では脇のアイコンを出さない */}
      {tools && !narrow ? (
        <div className="absolute top-2.5 left-full z-20 ml-[3px]">
          <div className="flex flex-col gap-0.5" style={{ zoom }}>
            <HiddenNodeToggles />
            <SortByProcessingButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * アプリ入力の列の境目と、カードへの線を通す余白。狭い画面では境目を出さず、余白は決まった幅
 */
export function AppGap({
  narrow,
  appWidth,
  gapWidth,
  onResize,
}: {
  readonly narrow: boolean;
  readonly appWidth: number;
  readonly gapWidth: number;
  readonly onResize: ColumnDividerProps['onResize'];
}): React.ReactElement {
  if (narrow) return <div className="shrink-0" style={{ width: NARROW_APP_GAP }} aria-hidden />;
  return (
    <>
      {/* 境目は脇のアイコンの左端 */}
      <ColumnDivider
        column="app"
        label={t('flow.canvas.appColumn')}
        width={appWidth}
        offset={APP_DIVIDER_OFFSET}
        line="start"
        onResize={onResize}
      />
      {/* アプリ入力からカードへの線を通す余白。幅はカードの左の境目で決める
        （他の余白とは連動しない） */}
      <div className="shrink-0" style={{ width: gapWidth }} aria-hidden />
      {/* 境目はカードの左 16px。右へ引くと余白が広がる */}
      <ColumnDivider
        column="appGap"
        label={t('flow.canvas.appGap')}
        width={gapWidth}
        offset={APP_GAP_DIVIDER_OFFSET + CARD_COLUMN_PADDING_LEFT}
        onResize={onResize}
      />
    </>
  );
}
