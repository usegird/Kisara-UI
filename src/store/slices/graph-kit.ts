import type { StoreApi } from 'zustand';

import { dropLinkedAppInputs } from '@/graph/app-inputs';
import { unpinMoved } from '@/graph/node-flags';
import { settleLayout } from '@/graph/order';
import { unlinkedDisplayIds } from '@/graph/subgraph-display';
import type { NodeId, Workflow } from '@/graph/types';
import type { GraphHistory, GraphState } from '@/store/use-graph-store';

const HISTORY_LIMIT = 50;

export const EMPTY_HISTORY: GraphHistory = { past: [], future: [] };

export const NO_SELECTION: readonly NodeId[] = [];

export const BLANK_NONE: ReadonlySet<string> = new Set();

export interface GraphMoment {
  readonly workflow: Workflow;
  readonly selectedNodeIds: readonly NodeId[];
  readonly hiddenCandidates: ReadonlySet<NodeId>;
}

type UpdatePatch = Pick<GraphState, 'workflow' | 'dirty' | 'hiddenCandidates'>;

interface GraphKit {
  readonly set: (patch: Partial<GraphState>) => void;
  readonly apply: (workflow: Workflow, next: Workflow) => UpdatePatch;
  readonly record: (
    workflow: Workflow,
    patch: Pick<GraphState, 'workflow'> & Partial<GraphState>,
  ) => void;
}

export function createGraphKit(
  rawSet: StoreApi<GraphState>['setState'],
  get: () => GraphState,
): GraphKit {
  const set = (patch: Partial<GraphState>): void => {
    const before = get().workflow;
    const after = patch.workflow;
    if (before && after && after !== before) {
      rawSet({ ...patch, workflow: unpinMoved(before, after) });
      return;
    }
    rawSet(patch);
  };
  const apply = (workflow: Workflow, next: Workflow): UpdatePatch =>
    update(get().hiddenCandidates, workflow, next);
  const record: GraphKit['record'] = (workflow, patch) => {
    if (patch.workflow === workflow) return;
    const state = get();
    const past = [...state.history.past, momentOf(state, workflow)].slice(-HISTORY_LIMIT);
    set({ ...patch, history: { past, future: [] } });
  };
  return { set, apply, record };
}

export function momentOf(state: GraphState, workflow: Workflow): GraphMoment {
  return {
    workflow,
    selectedNodeIds: state.selectedNodeIds,
    hiddenCandidates: state.hiddenCandidates,
  };
}

export function keptSelection(
  selected: readonly NodeId[],
  kept: readonly NodeId[],
): readonly NodeId[] {
  if (kept.length === selected.length) return selected;
  return kept.length > 0 ? kept : NO_SELECTION;
}

function update(candidates: ReadonlySet<NodeId>, workflow: Workflow, next: Workflow): UpdatePatch {
  if (next === workflow) return { workflow, dirty: false, hiddenCandidates: candidates };

  const settled = dropLinkedAppInputs(settleLayout(workflow, next));
  const unlinked = unlinkedDisplayIds(settled);
  const kept = [...candidates].filter((id) => unlinked.has(id));
  return {
    workflow: settled,
    dirty: true,
    hiddenCandidates: kept.length === candidates.size ? candidates : new Set(kept),
  };
}
