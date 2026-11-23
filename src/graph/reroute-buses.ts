import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { linkIndex } from '@/graph/link-read';
import { rectOf, TITLE_HEIGHT, type NodeRect, type OrderLayout } from '@/graph/node-box';
import type { LinkId, NodeId, ResolvedLink, Workflow, WorkflowNode } from '@/graph/types';

const FAR_COLUMNS = 5;
const MIN_FAR_LINKS = 2;
const MIN_PIERCED_NODES = 3;
export const PIERCE_COVERAGE = 0.5;
const SLOT_HEIGHT = 20;
const COVERAGE_STEPS = 50;
const STEP_MIDDLE = 0.5;

export function columnIndexes(workflow: Workflow, layout: OrderLayout): Map<NodeId, number> {
  const lefts = workflow.nodes
    .map((node) => ({ id: node.id, left: rectOf(node, layout).left }))
    .sort((a, b) => a.left - b.left || a.id - b.id);
  const columns = new Map<NodeId, number>();
  let index = -1;
  let start = Number.NEGATIVE_INFINITY;
  for (const { id, left } of lefts) {
    if (left - start > COLUMN_TOLERANCE) {
      index += 1;
      start = left;
    }
    columns.set(id, index);
  }
  return columns;
}

interface End {
  readonly rect: NodeRect;
  readonly y: number;
}

function endOf(node: WorkflowNode, slot: number, layout: OrderLayout): End {
  const rect = rectOf(node, layout);
  return { rect, y: rect.top + TITLE_HEIGHT + (slot + STEP_MIDDLE) * SLOT_HEIGHT };
}

function coverage(from: End, to: End, box: NodeRect, margin: number): number {
  const x0 = from.rect.right;
  const x1 = to.rect.left;
  if (x1 <= x0 || box.left <= x0 || box.right >= x1) return 0;
  const yAt = (x: number): number => from.y + ((to.y - from.y) * (x - x0)) / (x1 - x0);
  let inside = 0;
  for (let k = 0; k < COVERAGE_STEPS; k += 1) {
    const y = yAt(box.left + ((box.right - box.left) * (k + STEP_MIDDLE)) / COVERAGE_STEPS);
    if (y >= box.top - margin && y <= box.bottom + margin) inside += 1;
  }
  return inside / COVERAGE_STEPS;
}

export function outputKey(originId: NodeId, originSlot: number): string {
  return `${originId}:${originSlot}`;
}

interface FarLink {
  readonly id: LinkId;
  readonly targetId: NodeId;
}

export interface Candidate {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly from: number;
  readonly links: FarLink[];
  readonly pierced: Set<NodeId>;
}

export interface Bus {
  readonly key: string;
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly fromColumn: number;
  readonly toColumn: number;
  readonly links: readonly FarLink[];
}

export function farLinksByOutput(
  workflow: Workflow,
  layout: OrderLayout,
  columns: ReadonlyMap<NodeId, number>,
): Map<string, Candidate> {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const rects = new Map(workflow.nodes.map((node) => [node.id, rectOf(node, layout)]));
  const byOutput = new Map<string, Candidate>();
  for (const link of linkIndex(workflow.links).values()) {
    const from = columns.get(link.originId);
    const to = columns.get(link.targetId);
    const origin = byId.get(link.originId);
    const target = byId.get(link.targetId);
    if (!origin || !target || from === undefined || to === undefined) continue;
    if (to - from < FAR_COLUMNS) continue;
    const key = outputKey(link.originId, link.originSlot);
    const candidate = byOutput.get(key) ?? {
      originId: link.originId,
      originSlot: link.originSlot,
      from,
      links: [],
      pierced: new Set<NodeId>(),
    };
    candidate.links.push({ id: link.id, targetId: link.targetId });
    const a = endOf(origin, link.originSlot, layout);
    const b = endOf(target, link.targetSlot, layout);
    for (const [id, rect] of rects) {
      if (id === link.originId || id === link.targetId) continue;
      if (coverage(a, b, rect, layout.stackGap) >= PIERCE_COVERAGE) candidate.pierced.add(id);
    }
    byOutput.set(key, candidate);
  }
  return byOutput;
}

export function findBuses(
  candidates: ReadonlyMap<string, Candidate>,
  columns: ReadonlyMap<NodeId, number>,
): Bus[] {
  const column = (id: NodeId): number => columns.get(id) ?? 0;
  const buses: Bus[] = [];
  for (const [key, candidate] of candidates) {
    if (candidate.links.length < MIN_FAR_LINKS || candidate.pierced.size < MIN_PIERCED_NODES) {
      continue;
    }
    const sorted = [...candidate.links].sort(
      (a, b) => column(a.targetId) - column(b.targetId) || a.id - b.id,
    );
    buses.push({
      key,
      originId: candidate.originId,
      originSlot: candidate.originSlot,
      fromColumn: candidate.from,
      toColumn: Math.max(...sorted.map((link) => column(link.targetId))),
      links: sorted,
    });
  }
  return buses.sort(
    (a, b) =>
      a.toColumn - a.fromColumn - (b.toColumn - b.fromColumn) ||
      a.fromColumn - b.fromColumn ||
      a.originId - b.originId ||
      a.originSlot - b.originSlot,
  );
}

export interface Reroute {
  readonly id: number;
  readonly parentId?: number;
  readonly pos: readonly [number, number];
  readonly linkIds: readonly number[];
  readonly [key: string]: unknown;
}

export interface OwnBus {
  readonly head: Reroute;
  readonly members: readonly Reroute[];
}

export function ownBuses(
  reroutes: readonly Reroute[],
  own: ReadonlySet<number>,
  links: ReadonlyMap<LinkId, ResolvedLink>,
): Map<string, OwnBus> {
  const ours = reroutes.filter((reroute) => own.has(reroute.id));
  const heads = ours.filter((r) => r.parentId === undefined || !own.has(r.parentId));
  const buses = new Map<string, OwnBus>();
  const clashed = new Set<string>();
  for (const head of heads) {
    const keys = new Set(
      head.linkIds.flatMap((id) => {
        const link = links.get(id);
        return link ? [outputKey(link.originId, link.originSlot)] : [];
      }),
    );
    const [key] = keys;
    if (key === undefined || keys.size !== 1) continue;
    if (buses.has(key)) clashed.add(key);
    const tails = ours.filter((r) => r.parentId === head.id);
    buses.set(key, { head, members: [head, ...tails] });
  }
  for (const key of clashed) buses.delete(key);
  return buses;
}

export function untouched(
  bus: OwnBus,
  candidate: Candidate | undefined,
  changed: ReadonlySet<NodeId>,
): boolean {
  if (!candidate || changed.has(candidate.originId)) return false;
  if (candidate.links.some((link) => changed.has(link.targetId))) return false;
  const now = new Set(candidate.links.map((link) => link.id));
  const before = new Set(bus.head.linkIds);
  return now.size === before.size && [...before].every((id) => now.has(id));
}
