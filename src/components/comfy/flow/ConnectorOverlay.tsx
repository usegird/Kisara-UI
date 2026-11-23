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

const ACTIVE_STROKE_WIDTH = 3;

const IDLE_STROKE_OPACITY = 0.7;

const HIT_AREA_WIDTH = 20;

const STROKE_WIDTH: Record<ConnectorKind, number> = {
  direct: 1.2,
  'to-variable': 0.6,
  'to-card': 1.5,
  app: 1,
};

const APP_LINE_COLOR = 'var(--color-muted-foreground)';

function hasArrow(kind: ConnectorKind): boolean {
  return kind !== 'to-variable' && kind !== 'app';
}

function strokeOf(type: string): string {
  return type === APP_LINE_TYPE ? APP_LINE_COLOR : slotColor(type);
}

const INSERT_SIZE = 16;
const LEAVE_DELAY = 200;

const hitArea = cva('pointer-events-auto', {
  variants: { clickable: { true: 'cursor-pointer', false: '' } },
});

function markerId(type: string): string {
  return `kisara-arrow-${type.replace(/[^A-Za-z0-9]/g, '_')}`;
}

const NO_GROUPS: readonly AppInputGroup[] = [];
const NO_PROXY_ROWS: DisplayGraph['proxyRows'] = new Map();

export interface ConnectorOverlayProps {
  readonly boxes: readonly VariableBox[];
  readonly appGroups?: readonly AppInputGroup[] | undefined;
  readonly proxyRows?: DisplayGraph['proxyRows'] | undefined;
  readonly onAlign?:
    ((column: AlignColumn, other: number, card: number, at: number) => void) | undefined;
  readonly onInsert?: ((target: InsertTarget) => void) | undefined;
  readonly onDisconnect?: ((linkIds: readonly LinkId[]) => void) | undefined;
  readonly chipOutputs?: boolean | undefined;
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
  const rects = useAnchorRects(anchors, selectAllRects);
  const [hovered, setHovered] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<InsertTarget | null>(null);
  const hasMenu = onInsert !== undefined || onDisconnect !== undefined;
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const clipId = `kisara-clip-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  const showPassed = useSettingsStore((state) => state.showPassedLines);

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
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={HIT_AREA_WIDTH}
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

export const ConnectorOverlay = memo(function ConnectorOverlay(
  props: ConnectorOverlayProps,
): React.ReactElement | null {
  return (
    <RenderProbe id="ConnectorOverlay">
      <ConnectorOverlayContent {...props} />
    </RenderProbe>
  );
});
