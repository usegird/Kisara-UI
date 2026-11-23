import type { AlignColumn } from '@/components/comfy/flow/connector-geometry';
import { useColumnMoves } from '@/components/comfy/flow/use-column-moves';
import { useFlowZoom } from '@/components/comfy/flow/use-flow-zoom';
import type { NodeId } from '@/graph/types';
import { useFlowColumnRefs } from '@/hooks/flow/use-flow-column-refs';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import type { DragHandlers } from '@/hooks/ui/use-drag-from';
import { useDragPan } from '@/hooks/ui/use-drag-pan';
import { zoomFactor, type ZoomColumn } from '@/store/settings-fields/column-zoom';

const PAN_BLOCK = [
  'li',
  'section',
  '[data-flow-item]',
  'button',
  'input',
  'textarea',
  'select',
  'a',
  'label',
  '[contenteditable="true"]',
  'svg',
  '[role="separator"]',
  '[data-flow-overlay]',
].join(',');

const isPanSurface = (target: Element): boolean => target.closest(PAN_BLOCK) === null;

interface FlowScrolling {
  readonly attachFlowScroll: (element: HTMLDivElement | null) => void;
  readonly attachAppScroll: (element: HTMLDivElement | null) => void;
  readonly attachCardScroll: (element: HTMLDivElement | null) => void;
  readonly attachVariableScroll: (element: HTMLDivElement | null) => void;
  readonly attachRow: (element: HTMLDivElement | null) => void;
  readonly holdVariables: (hold: () => () => void) => void;
  readonly scrollColumns: () => (HTMLDivElement | null)[];
  readonly align: (column: AlignColumn, other: number, card: number, at: number) => void;
  readonly revealCard: (id: NodeId) => void;
  readonly revealGroup: (key: string) => void;
  readonly forwardWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  readonly pan: DragHandlers;
  readonly zoom: Readonly<Record<ZoomColumn, number>>;
  readonly zoomBy: (column: ZoomColumn, direction: number) => void;
}

export function useFlowScrolling(
  anchors: AnchorRegistry,
  draggingRoot: (element: HTMLElement | null) => void,
): FlowScrolling {
  const {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    holdVariables,
    startHold,
    columnsNow,
    scrollColumns,
  } = useFlowColumnRefs();
  const { align, revealCard, revealGroup, outsideColumn, forwardWheel } = useColumnMoves(anchors, {
    columnsNow,
    startHold,
  });
  const { attachRow, zooms, zoomBy } = useFlowZoom(anchors, draggingRoot, columnsNow);

  const pan = useDragPan(
    () => columnsNow().flow,
    (target, event) => {
      if (target.closest('[data-app-scroll]')) return columnsNow().app;
      if (target.closest('[data-flow-scroll]')) return columnsNow().cards;
      if (target.closest('[data-variable-panel]')) return columnsNow().variables;
      return outsideColumn(event.clientX, event.clientY);
    },
    isPanSurface,
  );

  return {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    attachRow,
    holdVariables,
    scrollColumns,
    align,
    revealCard,
    revealGroup,
    forwardWheel,
    pan,
    zoom: {
      app: zoomFactor(zooms.app),
      cards: zoomFactor(zooms.cards),
      variables: zoomFactor(zooms.variables),
    },
    zoomBy,
  };
}
