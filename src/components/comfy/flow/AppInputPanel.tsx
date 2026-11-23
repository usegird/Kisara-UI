import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { AppDragPreview } from '@/components/comfy/flow/AppDragPreview';
import { AppInputColumn } from '@/components/comfy/flow/AppInputGroups';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { RenderProbe } from '@/components/ui/render-probe';
import { parseAppInputDragId, type AppInputGroup } from '@/graph/app-input-order';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { useFrozenRects } from '@/hooks/flow/use-frozen-rects';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

export interface AppInputPanelProps {
  readonly groups: readonly AppInputGroup[];
  readonly spans: ReadonlyMap<string, number>;
  readonly heights: ReadonlyMap<string, number>;
  readonly onNeedOptions: (row: NodeRow) => void;
  readonly onResize: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly onRemoveGroup: (group: AppInputGroup) => void;
  readonly onCommentChange: (nodeId: NodeId, comment: string) => void;
  readonly onResizeHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  readonly enteringKey?: string | null | undefined;
  readonly leavingKey?: string | null | undefined;
  readonly onMotionEnd?: ((key: string) => void) | undefined;
  readonly enteringField?: string | null | undefined;
  readonly leavingField?: string | null | undefined;
  readonly onFieldMotionEnd?: ((key: string) => void) | undefined;
}

const noop = (): void => {};

function AppInputPanelContent(props: AppInputPanelProps): React.ReactElement {
  const moveAppInput = useGraphStore((state) => state.moveAppInput);
  const anchors = useContext(AnchorContext);
  const { collisionDetection, keyboardOptions, release } = useFrozenRects();
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, keyboardOptions),
  );
  const [dragging, setDragging] = useState(false);
  const finish = (): void => {
    setDragging(false);
    release();
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    finish();
    if (!over || active.id === over.id) return;
    const from = parseAppInputDragId(active.id);
    const to = parseAppInputDragId(over.id);
    if (from && to) moveAppInput(from, to);
  };

  if (props.groups.length === 0) {
    return <p className="text-muted-foreground px-1 py-2 text-xs">{t('flow.appInput.empty')}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={dragAccessibility()}
      onDragStart={() => {
        release();
        setDragging(true);
      }}
      onDragMove={anchors?.remeasure ?? noop}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <div data-dragging={dragging ? '' : undefined} className="data-dragging:pointer-events-none">
        <AppInputColumn {...props} />
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          <AppDragPreview />
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

export function AppInputPanel(props: AppInputPanelProps): React.ReactElement | null {
  return (
    <RenderProbe id="AppInputPanel">
      <AppInputPanelContent {...props} />
    </RenderProbe>
  );
}
