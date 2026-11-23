import type { NodeView } from '@/graph/rows';
import { slotTypeMatches } from '@/graph/search';
import type { NodeId } from '@/graph/types';
import { matchesAnyTerm, searchTerms } from '@/lib/search-terms';

export type ReferenceSide = 'outputs' | 'inputs';

export interface ReferenceSlot {
  readonly key: string;
  readonly nodeId: NodeId;
  readonly nodeIndex: string | null;
  readonly nodeLabel: string;
  readonly name: string;
  readonly type: string;
  readonly slot: number;
  readonly widget: { readonly name: string; readonly type: string } | null;
  readonly linked: boolean;
}

interface ReferenceOptions {
  readonly exclude: NodeId;
  readonly type: string;
  readonly anyType: boolean;
  readonly query: string;
}

function nodeLabelOf(view: NodeView): string {
  return view.comment.length > 0 ? view.comment : view.displayName;
}

export function referenceSlots(
  views: readonly NodeView[],
  side: ReferenceSide,
  { exclude, type, anyType, query }: ReferenceOptions,
): ReferenceSlot[] {
  const terms = searchTerms(query);
  const result: ReferenceSlot[] = [];

  for (const view of views) {
    if (view.id === exclude || view.broken !== undefined) continue;
    const nodeLabel = nodeLabelOf(view);
    const base = { nodeId: view.id, nodeIndex: view.index, nodeLabel };

    const slots: ReferenceSlot[] =
      side === 'outputs'
        ? view.outputs.map((output, slot) => ({
            ...base,
            key: `${String(view.id)}:out:${String(slot)}`,
            name: output.name,
            type: output.type,
            slot,
            widget: null,
            linked: false,
          }))
        : view.rows
            .filter((row) => row.linkable)
            .map((row) => ({
              ...base,
              key: `${String(view.id)}:in:${row.name}`,
              name: row.label,
              type: row.type,
              slot: row.inputSlot ?? -1,
              widget: row.kind === 'widget' ? { name: row.widgetName, type: row.type } : null,
              linked: row.kind === 'link',
            }));

    for (const slot of slots) {
      if (type !== '' && !slotTypeMatches(slot.type, type, anyType)) continue;
      if (!matchesAnyTerm([slot.nodeLabel, slot.name], terms)) continue;
      result.push(slot);
    }
  }
  return result;
}

interface ReferenceNode {
  readonly nodeId: NodeId;
  readonly nodeIndex: string | null;
  readonly nodeLabel: string;
  readonly count: number;
}

export function referenceNodes(slots: readonly ReferenceSlot[]): ReferenceNode[] {
  const nodes = new Map<NodeId, ReferenceNode>();
  for (const slot of slots) {
    const found = nodes.get(slot.nodeId);
    nodes.set(slot.nodeId, {
      nodeId: slot.nodeId,
      nodeIndex: slot.nodeIndex,
      nodeLabel: slot.nodeLabel,
      count: (found?.count ?? 0) + 1,
    });
  }
  return [...nodes.values()];
}
