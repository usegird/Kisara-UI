import { GROUP_FRAME_PADDING, SUBGRAPH_KNOB } from '@/components/comfy/flow/group-frame-look';
import type { NodeView } from '@/graph/rows';
import type { SubgraphFrame as SubgraphFrameData } from '@/graph/subgraph-display';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';

export interface SubgraphBranchProps {
  readonly frame: SubgraphFrameData;
  readonly head: NodeView;
  readonly onClose: (instanceId: NodeId) => void;
  readonly children: React.ReactNode;
}

const INDENT = 11;

const KNOB_BOTTOM_GAP = 4;
const LINE_X = -GROUP_FRAME_PADDING;
const LINE = 2;
const CARD_BORDER = 1;
const GAP_ABOVE = 12;

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
      <span
        aria-hidden
        className="border-muted-foreground/60 absolute border-l-2 border-dotted"
        style={{ left: LINE_X - LINE / 2, top: 0, bottom: SUBGRAPH_KNOB / 2 }}
      />
      {children}
      <SubgraphKnob
        label={title}
        style={{ left: LINE_X - SUBGRAPH_KNOB / 2, bottom: 0 }}
        onClick={() => onClose(frame.instanceId)}
      />
    </li>
  );
}

const BEND = 6;

export function SubgraphHeadLine(): React.ReactElement {
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
