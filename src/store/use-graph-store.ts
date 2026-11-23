import { create } from 'zustand';

import type { AppInputRef } from '@/graph/app-inputs';
import type { SortKey } from '@/graph/level-edit';
import type { ConnectRequest, InsertNodeOptions } from '@/graph/links';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { PlacementAnchor } from '@/graph/order';
import type { DropSide } from '@/graph/order-move';
import type { SubgraphWidgetRef } from '@/graph/subgraph';
import type {
  LinkId,
  NodeDefinition,
  NodeDefinitionMap,
  NodeId,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import type { WorkflowTool } from '@/graph/workflow-tool';
import { createGraphAddSlice } from '@/store/slices/graph-add';
import { createGraphAppInputSlice } from '@/store/slices/graph-app-inputs';
import { createGraphGroupSlice } from '@/store/slices/graph-groups';
import { EMPTY_HISTORY, NO_SELECTION, type GraphMoment } from '@/store/slices/graph-kit';
import { createGraphLinkSlice } from '@/store/slices/graph-links';
import { createGraphLoadSlice } from '@/store/slices/graph-load';
import { createGraphNodeLookSlice } from '@/store/slices/graph-node-look';
import { createGraphNodeValueSlice } from '@/store/slices/graph-node-values';
import { createGraphOrderSlice } from '@/store/slices/graph-order';
import { createGraphSelectionSlice } from '@/store/slices/graph-selection';
import { createGraphUndoSlice } from '@/store/slices/graph-undo';

export interface GraphHistory {
  readonly past: readonly GraphMoment[];
  readonly future: readonly GraphMoment[];
}

export interface SavedOrigin {
  readonly path: string;
  readonly baseUrl: string;
  readonly own: boolean;
}

export interface InsertNodePlacing {
  readonly slots?: InsertNodeOptions | undefined;
  readonly anchor?: PlacementAnchor | undefined;
  readonly blank?: ReadonlySet<string> | undefined;
}

export interface GraphState {
  readonly workflow: Workflow | null;
  readonly name: string;
  readonly savedPath: string | null;
  readonly savedOn: string | null;
  readonly savedOwn: boolean;
  readonly selectedNodeIds: readonly NodeId[];
  readonly dirty: boolean;
  readonly hiddenCandidates: ReadonlySet<NodeId>;
  readonly history: GraphHistory;

  readonly loadWorkflow: (raw: unknown, name?: string, saved?: SavedOrigin | null) => void;
  readonly setName: (name: string) => void;
  readonly markDirty: () => void;
  readonly markSaved: (savedPath: string, baseUrl: string, unchanged?: boolean) => void;
  readonly disownSaved: () => void;
  readonly clear: () => void;
  readonly restore: (snapshot: {
    readonly workflow: Workflow | null;
    readonly name: string;
    readonly savedPath: string | null;
    readonly savedOn?: string | null | undefined;
    readonly savedOwn?: boolean | undefined;
    readonly selectedNodeIds: readonly NodeId[];
    readonly dirty: boolean;
    readonly hiddenCandidates: ReadonlySet<NodeId>;
    readonly history?: GraphHistory | undefined;
  }) => void;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly refreshHiddenCandidates: () => void;
  readonly select: (nodeId: NodeId | null, additive?: boolean) => void;

  readonly setTitle: (nodeId: NodeId, title: string) => void;
  readonly toggleAppInput: (nodeId: NodeId, widgetName: string) => void;
  readonly moveAppInput: (from: AppInputRef, to: AppInputRef) => void;
  readonly setWorkflowTool: (tool: WorkflowTool | null) => void;
  readonly setAppInputSpan: (nodeId: NodeId, widgetName: string, span: number) => void;
  readonly setAppInputHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  readonly removeAppInputs: (refs: readonly AppInputRef[]) => void;
  readonly setMultilineHeight: (nodeId: NodeId, definition: NodeDefinition, height: number) => void;
  readonly toggleCollapsed: (nodeId: NodeId) => void;
  readonly setSubgraphOpen: (instanceId: NodeId, open: boolean) => void;
  readonly setWidgetValue: (
    nodeId: NodeId,
    definition: NodeDefinition,
    inputName: string,
    value: unknown,
  ) => boolean;

  readonly setProxyWidgetValue: (target: SubgraphWidgetRef, value: unknown) => boolean;

  readonly setOuterWidgetValue: (nodeId: NodeId, slot: number, value: unknown) => boolean;

  readonly advanceSeeds: (definitions: NodeDefinitionMap) => void;

  readonly updateNodeSettings: (nodeId: NodeId, patch: NodeSettingsPatch) => void;

  readonly addNode: (
    definition: NodeDefinition,
    anchor?: PlacementAnchor,
    connect?: ConnectRequest,
    blank?: ReadonlySet<string>,
  ) => void;
  readonly insertNodeAt: (
    linkIds: readonly LinkId[],
    definition: NodeDefinition,
    placing?: InsertNodePlacing,
  ) => void;

  readonly reorder: (from: number, to: number) => void;
  readonly moveNode: (activeId: NodeId, overId: NodeId) => void;
  readonly moveSortable: (active: SortKey, over: SortKey, side?: DropSide) => void;
  readonly groupNodes: (nodeIds: readonly NodeId[]) => void;
  readonly ungroup: (key: string) => void;
  readonly convertGroupToSubgraph: (key: string) => void;
  readonly convertSubgraphToGroup: (instanceId: NodeId) => void;
  readonly renameGroup: (key: string, title: string) => void;
  readonly setGroupColor: (key: string, color: string | null) => void;
  readonly setNodesBypassed: (nodeIds: readonly NodeId[], bypassed: boolean) => void;
  readonly appendNode: (node: WorkflowNode) => void;
  readonly insertNode: (linkId: LinkId, node: WorkflowNode) => void;
  readonly connect: (
    originId: NodeId,
    originSlot: number,
    targetId: NodeId,
    targetSlot: number,
  ) => void;
  readonly connectToWidget: (
    originId: NodeId,
    originSlot: number,
    targetId: NodeId,
    widget: { readonly name: string; readonly type: string },
  ) => void;
  readonly disconnect: (linkId: LinkId) => void;
  readonly disconnectLinks: (linkIds: readonly LinkId[]) => void;
  readonly addSubgraphEntrance: (
    nodeId: NodeId,
    widgetName: string,
    definitions: NodeDefinitionMap,
  ) => void;
  readonly sortByProcessing: (fromOrigin?: boolean) => void;
  readonly removeNode: (nodeId: NodeId) => void;
  readonly removeNodes: (nodeIds: readonly NodeId[]) => void;
  readonly cloneNode: (nodeId: NodeId, at?: PlacementAnchor) => void;
  readonly cloneNodes: (nodeIds: readonly NodeId[], at?: PlacementAnchor) => void;
}

export const useGraphStore = create<GraphState>()((...store) => ({
  workflow: null,
  name: '',
  savedPath: null,
  savedOn: null,
  savedOwn: false,
  selectedNodeIds: NO_SELECTION,
  dirty: false,
  hiddenCandidates: new Set(),
  history: EMPTY_HISTORY,
  ...createGraphLoadSlice(...store),
  ...createGraphUndoSlice(...store),
  ...createGraphSelectionSlice(...store),
  ...createGraphNodeLookSlice(...store),
  ...createGraphAppInputSlice(...store),
  ...createGraphNodeValueSlice(...store),
  ...createGraphAddSlice(...store),
  ...createGraphOrderSlice(...store),
  ...createGraphGroupSlice(...store),
  ...createGraphLinkSlice(...store),
}));
