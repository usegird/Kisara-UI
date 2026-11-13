import { GROUP_FRAME_PADDING, SUBGRAPH_KNOB } from '@/components/comfy/flow/group-frame-look';
import type { NodeView } from '@/graph/rows';
import type { SubgraphFrame as SubgraphFrameData } from '@/graph/subgraph-display';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';

// ─────────────────────────────
// 開いた subgraph の中の列の囲みと字下げの点線。並べ替えの受け口は中身の側（中のカードの列）が持つ。
// ─────────────────────────────

/** 開いた subgraph の囲みの受け取り物 */
export interface SubgraphBranchProps {
  readonly frame: SubgraphFrameData;
  /** インスタンスのカード（〇の名前に使う） */
  readonly head: NodeView;
  /** カードに戻す */
  readonly onClose: (instanceId: NodeId) => void;
  /** 中のカードの列 */
  readonly children: React.ReactNode;
}

/** 中のカードの字下げ（中のグループの枠が点線にかからない幅） */
const INDENT = 11;

/** 下端のつまみの下に空ける幅 */
const KNOB_BOTTOM_GAP = 4;
/** 点線の横位置（カードの左端から）。グループの枠の左端と同じ位置 */
const LINE_X = -GROUP_FRAME_PADDING;
/** 線の太さ */
const LINE = 2;
/** カードの枠線の太さ（見出しの中から描くときに、カードの左端へ戻す分） */
const CARD_BORDER = 1;
/** 見出しのカードとの間（並びの間隔 gap-3） */
const GAP_ABOVE = 12;

/** 見出しのカードの下に中のカードを字下げして並べ、末尾の〇でカードに戻せる点線を引く */
export function SubgraphBranch({
  frame,
  head,
  onClose,
  children,
}: SubgraphBranchProps): React.ReactElement {
  const title = head.comment.length > 0 ? head.comment : frame.name;
  return (
    <li
      className="relative"
      style={{ paddingLeft: INDENT, paddingBottom: SUBGRAPH_KNOB + KNOB_BOTTOM_GAP }}
      aria-label={t('flow.subgraph.frame', { name: title })}
    >
      {/* 縦の点線の続き（始まりと上半分は見出しのカードが描く。`SubgraphHeadLine`） */}
      <span
        aria-hidden
        className="border-muted-foreground/60 absolute border-l-2 border-dotted"
        style={{ left: LINE_X - LINE / 2, top: 0, bottom: SUBGRAPH_KNOB / 2 }}
      />
      {children}
      {/* 末尾の〇 */}
      <SubgraphKnob
        label={title}
        style={{ left: LINE_X - SUBGRAPH_KNOB / 2, bottom: 0 }}
        onClick={() => onClose(frame.instanceId)}
      />
    </li>
  );
}

/** 始点の曲がり角の丸み */
const BEND = 6;

/**
 * 開いた subgraph の見出しのカードの中に描く、点線の始まり。見出しの縦の中央でカードの左端から
 * 左へ出て、グループの枠の左端の位置で下へ曲がり、下の枝（`SubgraphBranch`）へ続く。
 * 見出し（`relative`）の中に置く
 */
export function SubgraphHeadLine(): React.ReactElement {
  // 見出しの左端はカードの枠線の内側。カードの左端へ戻してから、グループの枠の左端の位置へ
  const x = LINE_X - CARD_BORDER - LINE / 2;
  return (
    <span
      aria-hidden
      className="border-muted-foreground/60 absolute border-t-2 border-l-2 border-dotted"
      style={{
        left: x,
        width: -CARD_BORDER - x,
        top: `calc(50% - ${String(LINE / 2)}px)`,
        bottom: -(CARD_BORDER + GAP_ABOVE),
        borderTopLeftRadius: BEND,
      }}
    />
  );
}

/** 点線の端の〇。押すとカードに戻す */
function SubgraphKnob({
  label,
  style,
  onClick,
}: {
  readonly label: string;
  readonly style: React.CSSProperties;
  readonly onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="border-muted-foreground/70 bg-background hover:bg-muted absolute rounded-full
        border-2"
      style={{ ...style, width: SUBGRAPH_KNOB, height: SUBGRAPH_KNOB }}
      aria-label={t('flow.subgraph.close', { name: label })}
      title={t('flow.subgraph.closeTitle')}
      onClick={onClick}
    />
  );
}
