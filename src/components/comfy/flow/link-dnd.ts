import type { LinkId, NodeId } from '@/graph/types';
import { isRecord } from '@/lib/guards';

interface DragRow {
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly inputName: string;
}

interface OutputDragData {
  readonly kind: 'output';
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly type: string;
  readonly value: string;
  readonly row?: DragRow | undefined;
}

export const LINK_CHIP_ATTR = 'data-link-chip';

export type OutputDragSource = 'card' | 'panel' | 'row';

interface WidgetDropTarget {
  readonly name: string;
  readonly type: string;
}

interface InputDropData {
  readonly kind: 'input';
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly widget: WidgetDropTarget | null;
}

export function outputDragId(nodeId: NodeId, slot: number, from: 'card' | 'panel'): string {
  return `${from === 'card' ? 'chip' : 'var'}:${nodeId}:${slot}`;
}

export function linkChipDragId(linkId: LinkId): string {
  return `link:${linkId}`;
}

export function inputDropId(nodeId: NodeId, slot: number, widget: string | null = null): string {
  return widget === null ? `in:${nodeId}:${slot}` : `in:${nodeId}:w:${widget}`;
}

export function outputDragData(
  nodeId: NodeId,
  slot: number,
  type: string,
  value: string,
): OutputDragData {
  return { kind: 'output', nodeId, slot, type, value };
}

export function linkChipDragData(
  origin: { readonly nodeId: NodeId; readonly slot: number; readonly type: string },
  value: string,
  row: DragRow,
): OutputDragData {
  return { ...outputDragData(origin.nodeId, origin.slot, origin.type, value), row };
}

export function inputDropData(
  nodeId: NodeId,
  slot: number,
  widget: WidgetDropTarget | null = null,
): InputDropData {
  return { kind: 'input', nodeId, slot, widget };
}

export function isOutputDrag(value: unknown): value is OutputDragData {
  return (
    isRecord(value) &&
    value.kind === 'output' &&
    typeof value.nodeId === 'number' &&
    typeof value.slot === 'number' &&
    typeof value.type === 'string' &&
    typeof value.value === 'string'
  );
}

export function isInputDrop(value: unknown): value is InputDropData {
  return (
    isRecord(value) &&
    value.kind === 'input' &&
    typeof value.nodeId === 'number' &&
    typeof value.slot === 'number' &&
    typeof value.widget === 'object'
  );
}

interface LinkRequest {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
  readonly widget: WidgetDropTarget | null;
}

export function linkFromDrag(active: unknown, over: unknown): LinkRequest | null {
  if (!isOutputDrag(active) || !isInputDrop(over)) return null;
  if (active.nodeId === over.nodeId) return null;
  if (active.row?.nodeId === over.nodeId && active.row.slot === over.slot) return null;

  return {
    originId: active.nodeId,
    originSlot: active.slot,
    targetId: over.nodeId,
    targetSlot: over.slot,
    widget: over.widget,
  };
}

export function outputDragSource(id: string | number): OutputDragSource | null {
  if (typeof id !== 'string') return null;
  if (id.startsWith('chip:')) return 'card';
  if (id.startsWith('var:')) return 'panel';
  if (id.startsWith('link:')) return 'row';
  return null;
}
