import { cva } from 'class-variance-authority';
import { CirclePlus } from 'lucide-react';
import { memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { APP_LINE_TYPE } from '@/components/comfy/flow/connector-app-lines';
import {
  buildConnectors,
  insertPoint,
  pathOf,
  type AlignColumn,
  type Connector,
  type ConnectorKind,
  type InsertPoint,
  type InsertTarget,
} from '@/components/comfy/flow/connector-geometry';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { RenderProbe } from '@/components/ui/render-probe';
import type { AppInputGroup } from '@/graph/app-input-order';
import type { DisplayGraph } from '@/graph/subgraph-display';
import type { LinkId } from '@/graph/types';
import type { VariableBox } from '@/graph/variables';
import { selectAllRects, useAnchorRects } from '@/hooks/ui/use-anchor-registry';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { slotColor } from '@/styles/slot-color';

// ─────────────────────────────
// 接続線。変数経由・直結・アプリ入力からの線を、位置の表から組み立てて 1 枚の SVG に描く。
// ─────────────────────────────

/** 指している線の太さ */
const ACTIVE_STROKE_WIDTH = 3;

/** 指していない線の濃さ（重なった線どうしを見分けられるように） */
const IDLE_STROKE_OPACITY = 0.7;

const HIT_AREA_WIDTH = 20;

const STROKE_WIDTH: Record<ConnectorKind, number> = {
  direct: 1.2,
  'to-variable': 0.6,
  'to-card': 1.5,
  app: 1,
};

/** アプリ入力の線はスロット型に関係なく灰色（飾りなので目立たせない） */
const APP_LINE_COLOR = 'var(--color-muted-foreground)';

/** 終端に矢印を付けるか。変数宛（破線）とアプリ入力からの線は線だけ */
function hasArrow(kind: ConnectorKind): boolean {
  return kind !== 'to-variable' && kind !== 'app';
}

function strokeOf(type: string): string {
  return type === APP_LINE_TYPE ? APP_LINE_COLOR : slotColor(type);
}

/** 線の ⊕ の大きさ（px）と、線から外れてから消すまでの間（ms） */
const INSERT_SIZE = 16;
const LEAVE_DELAY = 200;

/** 線の当たり。押して列を揃えられるときだけ指の形にする */
const hitArea = cva('pointer-events-auto', {
  variants: { clickable: { true: 'cursor-pointer', false: '' } },
});

/** marker の id に使えるようスロット型を英数字に丸める */
function markerId(type: string): string {
  return `kisara-arrow-${type.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** 枠を渡されなかったときの既定。毎回新しい配列だと、それを見る hook が描画ごとに動く */
const NO_GROUPS: readonly AppInputGroup[] = [];
const NO_PROXY_ROWS: DisplayGraph['proxyRows'] = new Map();

/** 接続線の層の受け取り物。引く元の変数・アプリ入力の枠と、線を押したときの手続き */
export interface ConnectorOverlayProps {
  readonly boxes: readonly VariableBox[];
  /** アプリ入力の枠（並び順どおり） */
  readonly appGroups?: readonly AppInputGroup[] | undefined;
  /**
   * 開いた subgraph の昇格した入力 → 中の行。インスタンスのカードの代わりに中の行へ線を引く
   */
  readonly proxyRows?: DisplayGraph['proxyRows'] | undefined;
  /**
   * アプリ入力・変数とカードを結ぶ線を押したとき。組になる列、両端の今の高さ、押した高さを渡す。
   * どこまで送れるかは列の持ち主が知っているので、送り量はそちらで決める
   */
  readonly onAlign?:
    ((column: AlignColumn, other: number, card: number, at: number) => void) | undefined;
  /** 線の真ん中の ⊕。その線の間にノードを挟む */
  readonly onInsert?: ((target: InsertTarget) => void) | undefined;
  /** 線の右クリックの「接続を削除」。⊕ を出せる線（結線が分かる線）だけ */
  readonly onDisconnect?: ((linkIds: readonly LinkId[]) => void) | undefined;
  /**
   * 出力の線を、カードの点 1 つではなく出力チップごとに出す（デモで使う）
   */
  readonly chipOutputs?: boolean | undefined;
  /**
   * 列の外へ出たカードとの間の変数の線も、あるはずの位置へ向けて引く。
   * デモでは、出す側のカードが見えているときだけ引く
   */
  readonly offscreenLines?: boolean | undefined;
}

function ConnectorOverlayContent({
  boxes,
  appGroups = NO_GROUPS,
  proxyRows = NO_PROXY_ROWS,
  onAlign,
  onInsert,
  onDisconnect,
  chipOutputs = false,
  offscreenLines = true,
}: ConnectorOverlayProps): React.ReactElement | null {
  const anchors = useContext(AnchorContext);
  // 線は全部の位置から引くので、位置が変わるたびに描き直す
  const rects = useAnchorRects(anchors, selectAllRects);
  const [hovered, setHovered] = useState<string | null>(null);
  // 右クリックした線の結線。メニューが閉じても残すが、次に開くときに必ず置き換わる
  const [menuFor, setMenuFor] = useState<InsertTarget | null>(null);
  const hasMenu = onInsert !== undefined || onDisconnect !== undefined;
  // 線から ⊕ へ指を運ぶ間に消えないよう、外れてから少し待って消す
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  // この手続きは compiler が前回の物にしない（外すと線のメニューと ⊕ が描くたびに描き直す）ので、手で書く
  const hover = useCallback((id: string | null) => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
    if (id !== null) {
      setHovered(id);
      return;
    }
    leaving.current = setTimeout(() => setHovered(null), LEAVE_DELAY);
  }, []);
  useEffect(
    () => () => {
      if (leaving.current !== null) clearTimeout(leaving.current);
    },
    [],
  );
  // clipPath の参照に使う。useId の記号は url(#…) で読めないことがあるので英数字に丸める
  const clipId = `kisara-clip-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  const showPassed = useSettingsStore((state) => state.showPassedLines);

  // compiler は線の組み立てを下の早い return と指した線の ⊕ と同じ範囲にまとめ、指すたびに
  // 組み直す。線を指しても組み直さないよう、手で書く
  const connectors = useMemo(
    () =>
      anchors
        ? buildConnectors(
            rects,
            { boxes, appGroups, proxyRows },
            { showPassed, chipOutputs, offscreenLines },
          )
        : [],
    [anchors, rects, boxes, appGroups, proxyRows, showPassed, chipOutputs, offscreenLines],
  );

  if (connectors.length === 0) return null;

  const insertAt = onInsert ? insertPoint(connectors, hovered) : null;

  const onLineContextMenu = (connector: Connector, event: React.MouseEvent): void => {
    if (!hasMenu || connector.insert === undefined) {
      event.stopPropagation();
      return;
    }
    setMenuFor(connector.insert);
  };
  const onLineClick = (connector: Connector, event: React.MouseEvent): void => {
    const align = connector.align;
    const at = anchors?.localPoint(event.clientX, event.clientY);
    if (!align || !at || !onAlign) return;

    onAlign(align.column, align.other, align.card, at.y);
  };
  const onInsertPick = (target: InsertTarget): void => {
    hover(null);
    onInsert?.(target);
  };

  return (
    <ContextMenuRoot>
      {/* 右クリックは線の当たりから上がってくる。結線の分からない線は当たりで止めて、
          ブラウザのメニューのままにする */}
      <ContextMenuTrigger className="pointer-events-none absolute inset-0">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <ConnectorDefs connectors={connectors} clipId={clipId} />
          {connectors.map((connector, index) => {
            const path = pathOf(connector);
            const active = hovered === connector.id;

            return (
              <g
                key={connector.id}
                clipPath={connector.clip ? `url(#${clipId}-${String(index)})` : undefined}
              >
                {/* 当たり判定用。見た目より太く、透明 */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={HIT_AREA_WIDTH}
                  // 掴んでいる間のホバーは FlowCanvas の覆いが止める
                  // 押して揃えられないなら指の形にしない（⊕ を出すための当たりとしては残す）
                  className={hitArea({ clickable: onAlign !== undefined })}
                  onMouseEnter={() => hover(connector.id)}
                  onMouseLeave={() => hover(null)}
                  onContextMenu={(event) => onLineContextMenu(connector, event)}
                  onClick={(event) => onLineClick(connector, event)}
                >
                  <title>{connector.label}</title>
                </path>
                <path
                  d={path}
                  fill="none"
                  stroke={strokeOf(connector.type)}
                  // 変数宛だけ細い破線。矢印は直結と入力行宛だけ（アプリ入力からの線は線だけ）
                  strokeWidth={active ? ACTIVE_STROKE_WIDTH : STROKE_WIDTH[connector.kind]}
                  strokeDasharray={connector.kind === 'to-variable' ? '4 3' : undefined}
                  strokeOpacity={active ? 1 : IDLE_STROKE_OPACITY}
                  markerEnd={
                    hasArrow(connector.kind) ? `url(#${markerId(connector.type)})` : undefined
                  }
                />
              </g>
            );
          })}
        </svg>
      </ContextMenuTrigger>
      {menuFor === null ? null : (
        <LineMenu
          target={menuFor}
          onInsert={onInsertPick}
          canInsert={onInsert !== undefined}
          onDisconnect={onDisconnect}
        />
      )}
      {insertAt ? <LineInsertButton at={insertAt} onHover={hover} onInsert={onInsertPick} /> : null}
    </ContextMenuRoot>
  );
}

interface LineMenuProps {
  readonly target: InsertTarget;
  readonly canInsert: boolean;
  readonly onInsert: (target: InsertTarget) => void;
  readonly onDisconnect: ((linkIds: readonly LinkId[]) => void) | undefined;
}

/** 線の右クリック。⊕ と同じ挟み方と、その線の結線を外す（2 本以上なら全部） */
function LineMenu({
  target,
  canInsert,
  onInsert,
  onDisconnect,
}: LineMenuProps): React.ReactElement {
  const count = target.linkIds.length;
  return (
    <ContextMenuContent label={t('flow.connector.menu')}>
      <ContextMenuItem disabled={!canInsert} onClick={() => onInsert(target)}>
        {t('flow.connector.menuInsert')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={onDisconnect === undefined}
        onClick={() => onDisconnect?.(target.linkIds)}
      >
        {count > 1
          ? t('flow.connector.menuDisconnectAll', { count })
          : t('flow.connector.menuDisconnect')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

// ─────────────────────────────
// SVG の定義と ⊕ のボタン
// ─────────────────────────────

/** 見切る線ごとの描く範囲と、型ごとの矢印 */
function ConnectorDefs({
  connectors,
  clipId,
}: {
  readonly connectors: readonly Connector[];
  readonly clipId: string;
}): React.ReactElement {
  const arrowTypes = [...new Set(connectors.filter((c) => hasArrow(c.kind)).map((c) => c.type))];
  return (
    <defs>
      {connectors.map((connector, index) =>
        connector.clip ? (
          <clipPath key={connector.id} id={`${clipId}-${String(index)}`}>
            <rect
              x={-1e5}
              y={connector.clip.top}
              width={2e5}
              height={Math.max(0, connector.clip.bottom - connector.clip.top)}
            />
          </clipPath>
        ) : null,
      )}
      {arrowTypes.map((type) => (
        <marker
          key={type}
          id={markerId(type)}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeOf(type)} />
        </marker>
      ))}
    </defs>
  );
}

interface LineInsertButtonProps {
  readonly at: InsertPoint;
  readonly onHover: (id: string | null) => void;
  readonly onInsert: (target: InsertTarget) => void;
}

/**
 * 線の真ん中の ⊕。その線の間にノードを挟む
 */
function LineInsertButton({ at, onHover, onInsert }: LineInsertButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="bg-background absolute z-20 rounded-full opacity-80 hover:opacity-100
        in-data-dragging:pointer-events-none"
      style={{
        left: at.mid.x - INSERT_SIZE / 2,
        top: at.mid.y - INSERT_SIZE / 2,
        width: INSERT_SIZE,
        height: INSERT_SIZE,
        // 線と同じ色（どの線に挟むかが分かるように）
        color: strokeOf(at.insert.type),
      }}
      aria-label={t('flow.connector.insertLabel', { name: at.connector.label })}
      title={t('flow.connector.insertTitle')}
      onMouseEnter={() => onHover(at.connector.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onInsert(at.insert)}
    >
      <CirclePlus className="size-4" aria-hidden />
    </button>
  );
}

/**
 * 接続線の層。受け取り物が同じなら描き直さない。計測の範囲は内側に置く
 * （外側に置くと、画面が描き直すたびに範囲だけが数えられる）。
 * 使う側では compiler が要素を揃えきらない（カードを畳むと 1 回多く描く）ので、手で memo する
 */
export const ConnectorOverlay = memo(function ConnectorOverlay(
  props: ConnectorOverlayProps,
): React.ReactElement | null {
  return (
    <RenderProbe id="ConnectorOverlay">
      <ConnectorOverlayContent {...props} />
    </RenderProbe>
  );
});
