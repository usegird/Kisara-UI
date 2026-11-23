import { nodeInputs, nodeOutputs, slotTypeName, type WorkflowNode } from '@/graph/types';

const ANY_SLOT_TYPE = '*';

export function typesMatch(a: string, b: string): boolean {
  const left = slotTypeMembers(a);
  const right = slotTypeMembers(b);
  if (left.length === 0 || right.length === 0) return true;
  if (left.includes(ANY_SLOT_TYPE) || right.includes(ANY_SLOT_TYPE)) return true;
  return left.some((member) => right.includes(member));
}

function slotTypeMembers(type: string): string[] {
  return type
    .split(',')
    .map((member) => member.trim().toLowerCase())
    .filter((member) => member.length > 0);
}

export function inputSlotFor(node: WorkflowNode, type: string): number | null {
  const at = nodeInputs(node).findIndex((input) => typesMatch(slotTypeName(input.type), type));

  return at < 0 ? null : at;
}

export function outputSlotFor(node: WorkflowNode, type: string): number | null {
  const at = nodeOutputs(node).findIndex((output) => typesMatch(slotTypeName(output.type), type));

  return at < 0 ? null : at;
}
