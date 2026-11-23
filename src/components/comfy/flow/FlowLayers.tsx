import { DragOverlay } from '@dnd-kit/core';

import {
  ConnectorOverlay,
  type ConnectorOverlayProps,
} from '@/components/comfy/flow/ConnectorOverlay';
import { DragChip } from '@/components/comfy/flow/DragChip';
import { DragGhost } from '@/components/comfy/flow/DragGhost';
import { DragLine } from '@/components/comfy/flow/DragLine';
import type { FlowDnd } from '@/components/comfy/flow/use-flow-dnd';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';

export function OpenWorkflowHint(): React.ReactElement {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      {t('flow.canvas.openWorkflow')}
    </div>
  );
}

export function ConnectorLayer({
  resetKey,
  ...overlay
}: ConnectorOverlayProps & { readonly resetKey: unknown }): React.ReactElement {
  return (
    <ErrorBoundary label={t('flow.canvas.connectors')} resetKey={resetKey} fallback={() => null}>
      <ConnectorOverlay {...overlay} />
      <DragLine />
    </ErrorBoundary>
  );
}

export function EmbedHost({
  attachHost,
  style,
}: {
  readonly attachHost: (element: HTMLElement | null) => void;
  readonly style: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      ref={attachHost}
      data-flow-overlay
      className="pointer-events-none absolute top-0 bottom-0 z-20"
      style={style}
    />
  );
}

export function DragCover(): React.ReactElement {
  return (
    <div
      data-drag-cover
      aria-hidden
      className="absolute inset-0 z-30 hidden in-data-dragging:block"
    />
  );
}

export function FlowDragOverlay({
  dragging,
  ghost,
  zoom,
}: {
  readonly dragging: FlowDnd['dragging'];
  readonly ghost: FlowDnd['ghost'];
  readonly zoom: number;
}): React.ReactElement {
  return <DragOverlay dropAnimation={null}>{renderDragged(dragging, ghost, zoom)}</DragOverlay>;
}

function renderDragged(
  dragging: FlowDnd['dragging'],
  ghost: FlowDnd['ghost'],
  zoom: number,
): React.ReactElement | null {
  if (dragging !== null) return <DragChip type={dragging.type} value={dragging.value} />;
  if (ghost !== null) return <DragGhost node={ghost} zoom={zoom} />;
  return null;
}
