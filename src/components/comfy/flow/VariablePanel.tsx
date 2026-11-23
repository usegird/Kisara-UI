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

const groupTitle = cva('', {
  variants: {
    part: { index: 'shrink-0 font-semibold tabular-nums', label: 'truncate' },
    disabled: { true: 'line-through', false: '' },
  },
});

export interface VariablePanelProps {
  readonly groups: readonly VariableGroup[];
  readonly width: number | undefined;
  readonly narrow?: boolean | undefined;
  readonly zoom?: number | undefined;
  readonly onAddAfter?: ((id: NodeId, slot: number, type: string) => void) | undefined;
  readonly attachScroll?: ((element: HTMLDivElement | null) => void) | undefined;
  readonly onHoldReady?: ((hold: () => () => void) => void) | undefined;
  readonly onReveal?: ((id: NodeId) => void) | undefined;
  readonly groupOf?: Membership | undefined;
  readonly groupParents?: GroupParents | undefined;
  readonly groupLabels?: readonly GroupLabel[] | undefined;
  readonly onRevealGroup?: ((key: string) => void) | undefined;
}

const panelScroll = cva('h-full overflow-y-auto', {
  variants: { narrow: { true: 'overscroll-y-contain', false: 'overscroll-contain' } },
});

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
  const rects = useAnchorRects(anchors, selectAllRects);
  const panelRect = rects.get(PANEL_ANCHOR_KEY);
  const panelTop = panelRect?.top ?? 0;
  const panelHeight = panelRect ? panelRect.bottom - panelRect.top : 0;

  const viewportRect = rects.get(VIEWPORT_ANCHOR_KEY);
  const appearHeight = viewportRect ? viewportRect.bottom - panelTop : panelHeight;

  const frames = useMemo(
    () => frameSpans(groups, groupOf, groupParents, groupLabels),
    [groups, groupOf, groupParents, groupLabels],
  );

  const items = useMemo(() => {
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
  const topOf = (nodeId: NodeId): number => unzoom(positions.get(String(nodeId)) ?? 0, zoom);
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

  const syncKey = [
    Math.round(panelHeight),
    Math.round(appearHeight),
    zoom,
    ...items.map((item) =>
      [item.key, Math.round(item.cardBottom), item.before, item.after].join(':'),
    ),
  ].join('|');
  const synced = useRef<string | null>(null);
  const sync = useRef(INITIAL_PANEL_SYNC);
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

    if (holding.current) {
      sync.current = holdPanelSync(panel.scrollTop, target);
      return;
    }

    const result = syncPanelScroll(sync.current, { current: panel.scrollTop, target });
    if (result.scroll !== null && result.scroll !== panel.scrollTop) {
      panel.scrollTop = result.scroll;
    }
    sync.current = { ...result.state, applied: panel.scrollTop };
  }, [syncKey, items, positions, panelHeight, appearHeight, narrow]);

  const remeasure = anchors?.remeasure;
  useEffect(() => remeasure?.(), [remeasure, positions]);

  return (
    <div
      data-variable-panel
      ref={anchors?.register(PANEL_ANCHOR_KEY)}
      style={width === undefined ? undefined : { width }}
      className="h-full w-full shrink-0"
    >
      <div
        ref={(element) => {
          viewport.current = element;
          attachScroll?.(element);
        }}
        className={panelScroll({ narrow })}
      >
        <div className="relative w-full" style={{ height: unzoom(height, zoom), zoom }}>
          {frames.map((frame) => (
            <GroupFrame
              key={frame.label.key}
              label={frame.label}
              rect={frameRect(frame)}
              onReveal={onRevealGroup}
            />
          ))}
          {groups.map((group) => (
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
                  backgroundColor: UNIT_BACKGROUND,
                  left: LEFT_GUTTER,
                  right: FRAME_SIDE_PADDING,
                  top: topOf(group.nodeId),
                  height: groupHeight(group.boxes.length, pad, gap),
                  padding: pad,
                }}
              >
                <div
                  className="text-muted-foreground flex cursor-default items-center gap-1 px-1
                  text-3xs leading-none select-none"
                  style={{ height: LABEL_HEIGHT }}
                  title={
                    onReveal ? t('flow.variables.revealTitle', { name: group.label }) : group.label
                  }
                  onDoubleClick={onReveal ? () => onReveal(group.nodeId) : undefined}
                >
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

const UNIT_BACKGROUND = 'color-mix(in oklab, var(--color-band) 60%, var(--color-background))';

export interface FrameRect {
  readonly top: number;
  readonly height: number;
}

export function VariablePanel(props: VariablePanelProps): React.ReactElement | null {
  return (
    <RenderProbe id="VariablePanel">
      <VariablePanelContent {...props} />
    </RenderProbe>
  );
}
