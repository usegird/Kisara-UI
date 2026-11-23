import { findNode, removeInputSlots } from '@/graph/links';
import {
  nodeInputs,
  type InputDefinition,
  type NodeDefinition,
  type NodeId,
  type Workflow,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';

export function syncChoiceInputs(
  level: Workflow,
  nodeId: NodeId,
  definition: NodeDefinition,
): Workflow {
  const prefixes = choicePrefixes(definition.inputs);
  if (prefixes.length === 0) return level;
  const node = findNode(level, nodeId);
  if (!node) return level;
  const resolved = resolveWidgetValues(node, definition);
  if (!resolved.ok) return level;

  const inBranch = (name: string): boolean => prefixes.some((prefix) => name.startsWith(prefix));
  const chosen = new Set(resolved.inputs.map((input) => input.name));
  const slots = nodeInputs(node);
  const stale = new Set(
    slots.flatMap((slot, at) => (inBranch(slot.name) && !chosen.has(slot.name) ? [at] : [])),
  );
  const present = new Set(slots.map((slot) => slot.name));
  const added = resolved.inputs.filter(
    (input) => !input.isWidget && inBranch(input.name) && !present.has(input.name),
  );
  if (stale.size === 0 && added.length === 0) return level;

  const pruned = removeInputSlots(level, nodeId, stale);
  return {
    ...pruned,
    nodes: pruned.nodes.map((current) =>
      current.id === nodeId
        ? {
            ...current,
            inputs: [
              ...nodeInputs(current),
              ...added.map((input) => ({ name: input.name, type: input.type, link: null })),
            ],
          }
        : current,
    ),
  };
}

function choicePrefixes(inputs: readonly InputDefinition[]): string[] {
  return inputs.flatMap((input) =>
    input.branches
      ? [`${input.name}.`, ...input.branches.flatMap((branch) => choicePrefixes(branch.inputs))]
      : [],
  );
}
