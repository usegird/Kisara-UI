import type { NodeId, Workflow } from '@/graph/types';

interface FixedLayout {
  readonly order: readonly NodeId[];
  readonly membership: ReadonlyMap<NodeId, number>;
  readonly parents: ReadonlyMap<number, number>;
  readonly numbers: ReadonlyMap<NodeId, string>;
}

const fixed = new WeakMap<Workflow, FixedLayout>();

export function withFixedLayout(workflow: Workflow, layout: FixedLayout): Workflow {
  fixed.set(workflow, layout);
  return workflow;
}

export function fixedLayoutOf(workflow: Workflow): FixedLayout | undefined {
  return fixed.get(workflow);
}
