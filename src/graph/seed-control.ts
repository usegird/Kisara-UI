import type { NodeDefinition, NodeDefinitionMap, Workflow, WorkflowNode } from '@/graph/types';
import { nodeInputs } from '@/graph/types';
import { resolveWidgetValues, writeWidgetValue } from '@/graph/widgets';
import { clamp } from '@/lib/clamp';

export const SEED_CONTROLS = ['fixed', 'increment', 'decrement', 'randomize'] as const;

type SeedControl = (typeof SEED_CONTROLS)[number];

function isControl(value: unknown): value is SeedControl {
  return typeof value === 'string' && (SEED_CONTROLS as readonly string[]).includes(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

type Random = () => number;

export function nextSeed(
  current: number,
  control: SeedControl,
  config: { readonly min?: unknown; readonly max?: unknown },
  random: Random = Math.random,
): number {
  const min = num(config.min, 0);
  const max = Math.min(num(config.max, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  const inRange = (value: number): number => clamp(value, min, max);

  switch (control) {
    case 'increment':
      return inRange(current + 1);
    case 'decrement':
      return inRange(current - 1);
    case 'randomize':
      return inRange(Math.floor(random() * (max - min + 1)) + min);
    case 'fixed':
      return current;
  }
}

function advanceNode(
  node: WorkflowNode,
  definition: NodeDefinition,
  random: Random,
): WorkflowNode | null {
  const widgets = resolveWidgetValues(node, definition);
  if (!widgets.ok) return null;

  const control = widgets.byWidget.get('control_after_generate');
  if (!isControl(control) || control === 'fixed') return null;

  const target = widgets.slots.find((slot) => slot.kind === 'control_after_generate');
  if (!target) return null;

  const linked = nodeInputs(node).some(
    (input) => input.name === target.input && input.link !== null && input.link !== undefined,
  );
  if (linked) return null;

  const current = widgets.byInput.get(target.input);
  if (typeof current !== 'number') return null;

  const config = definition.inputs.find((input) => input.name === target.input)?.config ?? {};

  return writeWidgetValue(
    node,
    definition,
    target.input,
    nextSeed(current, control, config, random),
  );
}

export function advanceSeeds(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  random: Random = Math.random,
): Workflow {
  let changed = false;

  const nodes = workflow.nodes.map((node) => {
    const definition = definitions.get(node.type);
    if (!definition) return node;

    const next = advanceNode(node, definition, random);
    if (!next) return node;

    changed = true;
    return next;
  });

  return changed ? { ...workflow, nodes } : workflow;
}
