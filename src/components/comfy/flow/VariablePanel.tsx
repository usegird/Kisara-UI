import { cva } from 'class-variance-authority';
import { useContext, useEffect, useMemo, useRef } from 'react';

import {
  AnchorContext,
  cardAnchorKey,
  PANEL_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import { FlowLookContext } from '@/components/comfy/flow/flow-look-context';
import {
  boxGap,
  frameSpans,
  groupPadding,
  type FrameSpan,
} from '@/components/comfy/flow/variable-panel-values';
import { Box } from '@/components/comfy/flow/VariableBoxItem';
import { GroupFrame } from '@/components/comfy/flow/VariableGroupFrame';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { RenderProbe } from '@/components/ui/render-probe';
import { NO_PARENTS, type GroupLabel, type GroupParents, type Membership } from '@/graph/groups';
import type { NodeId } from '@/graph/types';
import { groupHeight, VARIABLE_PANEL_METRICS } from '@/graph/variable-panel-metrics';
import type { VariableGroup } from '@/graph/variables';
import { selectAllRects, useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';
import {
  fillCardBottoms,
  holdPanelSync,
  INITIAL_PANEL_SYNC,
  panelScrollTop,
  syncPanelScroll,
} from '@/lib/panel-scroll';
import { packList } from '@/lib/stack-layout';
import { unzoom } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// 右側の変数パネル。カード単位のまとまりを詰めて並べ、カード列のスクロールに連動させる。
// ─────────────────────────────

const {
  BOX_HEIGHT,
  LABEL_HEIGHT,
  GROUP_GAP,
  LEFT_GUTTER,
  FRAME_TAB_HEIGHT,
  FRAME_PADDING,
  FRAME_SIDE_PADDING,
} = VARIABLE_PANEL_METRICS;

const NO_MEMBERSHIP: Membership = new Map();
const NO_LABELS: readonly GroupLabel[] = [];

/** まとまりの見出し（通し番号・ラベル）。生成元が無効なら取り消し線 */
const groupTitle = cva('', {
  variants: {
    part: { index: 'shrink-0 font-semibold tabular-nums', label: 'truncate' },
    disabled: { true: 'line-through', false: '' },
  },
});

/** 変数パネルの受け取り物 */
export interface VariablePanelProps {
  readonly groups: readonly VariableGroup[];
  /**
   * 列幅（仕切りのドラッグで変わる）。無ければ置き場の幅いっぱい（狭い画面）
   */
  readonly width: number | undefined;
  /** 狭い画面。横に払った動きは外の面へ渡す（縦の送りだけを留める） */
  readonly narrow?: boolean | undefined;
  /**
   * 中身の倍率。1 が等倍。まとまりの位置はカードに合わせて画面の px で決め、
   * 倍率のかかった中へ置くときに割り戻す
   */
  readonly zoom?: number | undefined;
  /** 変数の枠の左外の ◀。その変数を受け取るノードを足す（型は絞り込みの初期値） */
  readonly onAddAfter?: ((id: NodeId, slot: number, type: string) => void) | undefined;
  /** 列の送りの要素を受け取る。線を押したときに、カードの列と一緒に送るため */
  readonly attachScroll?: ((element: HTMLDivElement | null) => void) | undefined;
  /**
   * 連動を止める関数を受け取る。線を押して揃えるときに呼ぶ。
   * 呼ぶと連動を止め、止めをやめる関数を返す（カードの列が送り終わったら呼ぶ）
   */
  readonly onHoldReady?: ((hold: () => () => void) => void) | undefined;
  /** まとまりの見出しのダブルクリック。生成元のカードを列の上端へ送る */
  readonly onReveal?: ((id: NodeId) => void) | undefined;
  /**
   * ノードの所属（`groups[]` の添字）と、添字ごとの名前・色。帯を出すのに使う
   */
  readonly groupOf?: Membership | undefined;
  /**
   * グループの親。帯は外側のグループだけに出す
   */
  readonly groupParents?: GroupParents | undefined;
  readonly groupLabels?: readonly GroupLabel[] | undefined;
  /** 帯のタブのダブルクリック。グループの枠を列の上端へ送る。渡さなければ送らない */
  readonly onRevealGroup?: ((key: string) => void) | undefined;
}

/**
 * 変数の列の送りの枠。狭い画面では横に払った動きを外の面へ渡す。
 * 上の余白はアプリ入力・カードの列と同じ（`COLUMN_TOP_PADDING`）
 */
const panelScroll = cva('h-full overflow-y-auto', {
  variants: { narrow: { true: 'overscroll-y-contain', false: 'overscroll-contain' } },
});

/** 送りの枠の上の余白（px）。連動の位置はこのぶん下げて求める */
function topPadding(narrow: boolean): number {
  return narrow ? 0 : VARIABLE_PANEL_METRICS.COLUMN_TOP_PADDING;
}

function VariablePanelContent({
  groups,
  width,
  narrow = false,
  zoom = 1,
  onAddAfter,
  attachScroll,
  onHoldReady,
  onReveal,
  groupOf = NO_MEMBERSHIP,
  groupParents = NO_PARENTS,
  groupLabels = NO_LABELS,
  onRevealGroup,
}: VariablePanelProps): React.ReactElement {
  const anchors = useContext(AnchorContext);
  const { roomy } = useContext(FlowLookContext);
  const pad = groupPadding(roomy);
  const gap = boxGap(roomy);
  // 生成元のカードに合わせて積むので、位置が変わるたびに描き直す
  const rects = useAnchorRects(anchors, selectAllRects);
  const panelRect = rects.get(PANEL_ANCHOR_KEY);
  const panelTop = panelRect?.top ?? 0;
  const panelHeight = panelRect ? panelRect.bottom - panelRect.top : 0;

  // カードの出力欄が「見えた」かどうかは、パネルではなくフロー全体の表示領域で判断する
  const viewportRect = rects.get(VIEWPORT_ANCHOR_KEY);
  const appearHeight = viewportRect ? viewportRect.bottom - panelTop : panelHeight;

  // 同じグループのまとまりを囲む帯。先頭の上にタブと余白、末尾の下に余白を空ける。
  // `items` と `positions` は送りを合わせる effect の依存なので、compiler に任せず手で固定する
  // （`frames` はその依存）
  const frames = useMemo(
    () => frameSpans(groups, groupOf, groupParents, groupLabels),
    [groups, groupOf, groupParents, groupLabels],
  );

  const items = useMemo(() => {
    // 生成元カードの出力欄の位置（パネル上端からの相対）
    const bottoms = fillCardBottoms(
      groups.map((group) => {
        const rect = rects.get(cardAnchorKey(group.nodeId));
        return rect ? rect.bottom - panelTop : null;
      }),
    );
    const before = new Map(
      frames.map((frame) => [frame.firstId, FRAME_TAB_HEIGHT + FRAME_PADDING]),
    );
    const after = new Map(frames.map((frame) => [frame.lastId, FRAME_PADDING]));
    return groups.map((group, index) => ({
      key: String(group.nodeId),
      height: groupHeight(group.boxes.length, pad, gap) * zoom,
      cardBottom: bottoms[index] ?? Number.NEGATIVE_INFINITY,
      before: (before.get(group.nodeId) ?? 0) * zoom,
      after: (after.get(group.nodeId) ?? 0) * zoom,
    }));
  }, [groups, frames, rects, panelTop, zoom, pad, gap]);

  const positions = useMemo(() => packList(items, { gap: GROUP_GAP * zoom }), [items, zoom]);
  /** 倍率のかかった中での縦位置 */
  const topOf = (nodeId: NodeId): number => unzoom(positions.get(String(nodeId)) ?? 0, zoom);
  /** 倍率のかかった中での帯の範囲（タブの上端から末尾の余白まで） */
  const frameRect = (frame: FrameSpan): FrameRect => {
    const last = groups.find((group) => group.nodeId === frame.lastId);
    const top = topOf(frame.firstId) - FRAME_TAB_HEIGHT - FRAME_PADDING;
    const bottom =
      topOf(frame.lastId) + groupHeight(last?.boxes.length ?? 0, pad, gap) + FRAME_PADDING;
    return { top, height: bottom - top };
  };
  const height = Math.max(
    ...items.map((item) => (positions.get(item.key) ?? 0) + item.height + item.after),
    0,
  );

  const viewport = useRef<HTMLDivElement>(null);

  // 位置に影響する値。これが変わったときだけ合わせる＝手動スクロールでは動かさない
  const syncKey = [
    Math.round(panelHeight),
    Math.round(appearHeight),
    // 倍率を変えるとまとまりの高さが変わるので合わせ直す
    zoom,
    // 帯が付く・外れると位置が変わるので合わせ直す
    ...items.map((item) =>
      [item.key, Math.round(item.cardBottom), item.before, item.after].join(':'),
    ),
  ].join('|');
  const synced = useRef<string | null>(null);
  const sync = useRef(INITIAL_PANEL_SYNC);
  // 線を押して揃えている間は連動を止める（揃えた位置が送りの途中で引き戻されないように）
  const holding = useRef(false);

  useEffect(() => {
    onHoldReady?.(() => {
      holding.current = true;
      return () => {
        holding.current = false;
      };
    });
  }, [onHoldReady]);

  useEffect(() => {
    const panel = viewport.current;
    if (!panel) return;
    if (synced.current === syncKey) return;
    synced.current = syncKey;

    const target = panelScrollTop({
      viewHeight: panelHeight,
      appearHeight,
      items: items.map((item) => ({
        top: (positions.get(item.key) ?? 0) + topPadding(narrow),
        height: item.height,
        cardBottom: item.cardBottom,
      })),
    });

    // 揃えている間は動かさず、**今の位置を手で置いた位置**として覚え直す。
    // 連動に戻るのは、この先のカードの列の送りで連動の位置がここを越えたとき
    if (holding.current) {
      sync.current = holdPanelSync(panel.scrollTop, target);
      return;
    }

    const result = syncPanelScroll(sync.current, { current: panel.scrollTop, target });
    if (result.scroll !== null && result.scroll !== panel.scrollTop) {
      panel.scrollTop = result.scroll;
    }
    // ブラウザ側で丸められることがあるので、実際に入った値を覚える
    sync.current = { ...result.state, applied: panel.scrollTop };
  }, [syncKey, items, positions, panelHeight, appearHeight, narrow]);

  // ボックスを動かしても ResizeObserver は反応しない（大きさは変わらないため）。
  // 接続線が古い位置を指さないよう、配置が変わったら測り直す。
  const remeasure = anchors?.remeasure;
  useEffect(() => remeasure?.(), [remeasure, positions]);

  return (
    <div
      data-variable-panel
      ref={anchors?.register(PANEL_ANCHOR_KEY)}
      style={width === undefined ? undefined : { width }}
      className="h-full w-full shrink-0"
    >
      {/* 手で動かせる。次に全体スクロールが動くまでその位置のまま */}
      <div
        ref={(element) => {
          viewport.current = element;
          attachScroll?.(element);
        }}
        className={panelScroll({ narrow })}
      >
        <div className="relative w-full" style={{ height: unzoom(height, zoom), zoom }}>
          {/* 帯はまとまりの下に敷く（先に置く）。幅はまとまりと同じで、上下だけ広げる */}
          {frames.map((frame) => (
            <GroupFrame
              key={frame.label.key}
              label={frame.label}
              rect={frameRect(frame)}
              onReveal={onRevealGroup}
            />
          ))}
          {groups.map((group) => (
            // まとまり 1 つずつ受け止め、同じ場所に差し替えを出す
            <ErrorBoundary
              key={group.nodeId}
              label={t('flow.variables.group', { name: group.label })}
              resetKey={group}
              fallback={(error, retry) => (
                <div
                  data-flow-item
                  className="absolute overflow-hidden"
                  style={{
                    left: LEFT_GUTTER,
                    right: FRAME_SIDE_PADDING,
                    top: topOf(group.nodeId),
                    height: groupHeight(group.boxes.length, pad, gap),
                  }}
                >
                  <BrokenNotice
                    label={t('flow.variables.group', { name: group.label })}
                    error={error}
                    onRetry={retry}
                  />
                </div>
              )}
            >
              <div
                data-flow-item
                className="absolute rounded-md"
                style={{
                  // 地は不透明にする（帯の色を透かさず、帯の中でも外と同じ白のまま）
                  backgroundColor: UNIT_BACKGROUND,
                  // 左は三角のぶんだけ空ける（枠の外に出すため）。右は帯の横の余白のぶん空ける
                  left: LEFT_GUTTER,
                  right: FRAME_SIDE_PADDING,
                  top: topOf(group.nodeId),
                  height: groupHeight(group.boxes.length, pad, gap),
                  padding: pad,
                }}
              >
                <div
                  // 文字の選択を止める（カーソルがキャレットにならず、ダブルクリックで選択もしない）
                  className="text-muted-foreground flex cursor-default items-center gap-1 px-1
                  text-3xs leading-none select-none"
                  style={{ height: LABEL_HEIGHT }}
                  title={
                    onReveal ? t('flow.variables.revealTitle', { name: group.label }) : group.label
                  }
                  onDoubleClick={onReveal ? () => onReveal(group.nodeId) : undefined}
                >
                  {/* 生成元が無効（ミュート・バイパス）なら見出しに取り消し線 */}
                  {group.index !== null ? (
                    <span className={groupTitle({ disabled: group.disabled, part: 'index' })}>
                      {group.index}
                    </span>
                  ) : null}
                  <span className={groupTitle({ disabled: group.disabled, part: 'label' })}>
                    {group.label}
                  </span>
                </div>

                {group.boxes.map((box, index) => (
                  <Box
                    key={box.key}
                    box={box}
                    index={group.index}
                    top={LABEL_HEIGHT + pad + index * (BOX_HEIGHT + gap)}
                    onAddAfter={onAddAfter}
                  />
                ))}
              </div>
            </ErrorBoundary>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * まとまりの地。帯の灰を地の色に混ぜた不透明の色（帯の色を透かさない）。外枠は引かないので、
 * 地と見分けられる濃さにする（アプリ入力の枠と同じ）
 */
const UNIT_BACKGROUND = 'color-mix(in oklab, var(--color-band) 60%, var(--color-background))';

/** 帯の縦の範囲（倍率のかかった中の px） */
export interface FrameRect {
  readonly top: number;
  readonly height: number;
}

/**
 * 変数パネルを描く。計測の範囲は内側に置く
 * （外側に置くと、画面が描き直すたびに範囲だけが数えられる）
 */
export function VariablePanel(props: VariablePanelProps): React.ReactElement | null {
  return (
    <RenderProbe id="VariablePanel">
      <VariablePanelContent {...props} />
    </RenderProbe>
  );
}
