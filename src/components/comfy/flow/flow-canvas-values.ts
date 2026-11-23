import {
  FLOW_VIEWPORT_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import type { FlowCanvasProps } from '@/components/comfy/flow/FlowCanvas';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import type { DisplayGraph } from '@/graph/subgraph-display';
import { openCardIdOf } from '@/graph/subgraph-level';
import type { NodeDefinitionMap, NodeId, WorkflowNode } from '@/graph/types';
import { buildVariableBoxes, type VariableBox } from '@/graph/variables';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import type { ColumnWidths } from '@/store/settings-fields/column-widths';
import type { ExecutionState } from '@/store/use-execution-store';
import type { SettingsState } from '@/store/use-settings-store';

export type FlowColumnWidths = Omit<ColumnWidths, 'queue' | 'chatSide'>;

export function registerFlowViewport(
  anchors: AnchorRegistry,
  element: HTMLElement | null,
  { overlaid, narrow }: { readonly overlaid: boolean; readonly narrow: boolean },
): void {
  anchors.register(FLOW_VIEWPORT_ANCHOR_KEY)(overlaid ? element : null);
  if (narrow) anchors.register(VIEWPORT_ANCHOR_KEY)(element);
}

export function flowColumnWidthsOf({ columnWidths }: SettingsState): FlowColumnWidths {
  return {
    app: columnWidths.app,
    appGap: columnWidths.appGap,
    cards: columnWidths.cards,
    variablesGap: columnWidths.variablesGap,
    variables: columnWidths.variables,
  };
}

const SIDE_ICON_WIDTH = 24;

export const APP_ICON_GAP = 3;

const APP_COLUMN_SHIFT = 9;

export function embedOffset(appZoom: number): number {
  return -APP_COLUMN_SHIFT + APP_ICON_GAP + SIDE_ICON_WIDTH * appZoom + APP_ICON_GAP;
}

export function boxKey(box: VariableBox): string {
  return box.key;
}

export function cardStatesOf(
  nodeStates: ExecutionState['nodeStates'],
  errorNode: string | null,
  open: ReadonlySet<NodeId>,
): Map<NodeId, NodeCardState> {
  const map = new Map<NodeId, NodeCardState>();

  for (const [promptNodeId, state] of Object.entries(nodeStates)) {
    const id = openCardIdOf(promptNodeId, open);
    if (id === null) continue;
    if (state === 'running') map.set(id, 'running');
    else if (state === 'error') map.set(id, 'error');
  }
  const failed = errorNode === null ? null : openCardIdOf(errorNode, open);
  if (failed !== null) map.set(failed, 'error');

  return map;
}

const NO_OPEN: ReadonlySet<NodeId> = new Set();

export function openFramesOf(display: DisplayGraph | null): ReadonlySet<NodeId> {
  return display && display.frames.size > 0 ? new Set(display.frames.keys()) : NO_OPEN;
}

export function variableBoxesOf(
  shown: DisplayGraph['workflow'] | null,
  definitions: NodeDefinitionMap,
): VariableBox[] {
  return shown ? buildVariableBoxes(shown, definitions) : [];
}

export function settingsNodeOf(
  shown: DisplayGraph['workflow'] | null,
  id: NodeId | null,
): WorkflowNode | null {
  return shown?.nodes.find((node) => node.id === id) ?? null;
}

type FlowOptions = Required<FlowCanvasProps>;

export function flowOptionsOf(props: FlowCanvasProps): FlowOptions {
  return {
    insertBar: props.insertBar ?? true,
    nodeSettings: props.nodeSettings ?? true,
    cardTools: props.cardTools ?? true,
    appImport: props.appImport ?? true,
    appScrollbarLeft: props.appScrollbarLeft ?? false,
    commentBelow: props.commentBelow ?? false,
    chipOutputs: props.chipOutputs ?? false,
    offscreenLines: props.offscreenLines ?? true,
    appRemove: props.appRemove ?? true,
    clickScroll: props.clickScroll ?? true,
    dragPan: props.dragPan ?? true,
    roomy: props.roomy ?? false,
  };
}
