import { FALLBACK_SIZE } from '@/graph/node-settings';
import type { NodeDefinition, WorkflowNode } from '@/graph/types';
import { nodeInputs, nodeOutputs } from '@/graph/types';
import { widgetSlots } from '@/graph/widgets';

const SLOT_HEIGHT = 20;
const WIDGET_HEIGHT = 24;
const PADDING = 8;

export const MIN_MULTILINE_HEIGHT = 48;

export const DEFAULT_MULTILINE_HEIGHT = 64;

function isLinked(node: WorkflowNode, name: string): boolean {
  const input = nodeInputs(node).find((candidate) => candidate.name === name);
  return typeof input?.link === 'number';
}

function multilineNames(definition: NodeDefinition): ReadonlySet<string> {
  return new Set(
    definition.inputs
      .filter((input) => input.isWidget && input.config.multiline === true)
      .map((input) => input.name),
  );
}

function fixedHeight(
  node: WorkflowNode,
  definition: NodeDefinition,
  multiline: ReadonlySet<string>,
): number {
  const inputs = nodeInputs(node);
  const slotInputs = inputs.filter(
    (input) => (!input.widget || typeof input.link === 'number') && !multiline.has(input.name),
  );
  const slotRows = Math.max(slotInputs.length, nodeOutputs(node).length);

  const widgetRows = widgetSlots(definition).filter(
    (slot) => !multiline.has(slot.input) && !isLinked(node, slot.input),
  ).length;

  return slotRows * SLOT_HEIGHT + widgetRows * WIDGET_HEIGHT + PADDING;
}

function sizeHeight(node: WorkflowNode): number | null {
  const size = node.size;
  if (!Array.isArray(size)) return null;

  const height: unknown = size[1];
  return typeof height === 'number' && Number.isFinite(height) ? height : null;
}

export function multilineHeight(node: WorkflowNode, definition: NodeDefinition): number | null {
  const names = multilineNames(definition);
  const height = sizeHeight(node);
  if (names.size === 0 || height === null) return null;

  const each = (height - fixedHeight(node, definition, names)) / names.size;
  return Math.max(MIN_MULTILINE_HEIGHT, Math.round(each));
}

export function withMultilineHeight(
  node: WorkflowNode,
  definition: NodeDefinition,
  height: number,
): WorkflowNode {
  const names = multilineNames(definition);
  if (names.size === 0) return node;

  const each = Math.max(MIN_MULTILINE_HEIGHT, Math.round(height));
  const total = fixedHeight(node, definition, names) + each * names.size;
  const width: unknown = Array.isArray(node.size) ? node.size[0] : undefined;
  if (sizeHeight(node) === total) return node;

  return { ...node, size: [typeof width === 'number' ? width : FALLBACK_SIZE[0], total] };
}
