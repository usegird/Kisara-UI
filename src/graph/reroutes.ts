import { workflowGroups } from '@/graph/groups';
import { linkIndex } from '@/graph/link-read';
import { rectOf, type NodeRect, type OrderLayout } from '@/graph/node-box';
import { ownData, writeOwnData } from '@/graph/own-data';
import {
  columnIndexes,
  farLinksByOutput,
  findBuses,
  ownBuses,
  PIERCE_COVERAGE,
  untouched,
  type Bus,
  type OwnBus,
  type Reroute,
} from '@/graph/reroute-buses';
import type { LinkId, NodeId, ResolvedLink, Workflow, WorkflowNode } from '@/graph/types';
import { isRecord } from '@/lib/guards';

const OWN_REROUTES = 'reroutes';
const REROUTES = 'reroutes';
const LINK_EXTENSIONS = 'linkExtensions';

interface LinkExtension {
  readonly id: LinkId;
  readonly parentId: number;
}

function readReroutes(extra: Record<string, unknown>): Reroute[] {
  const raw = extra[REROUTES];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Reroute[] => {
    if (!isRecord(item) || typeof item.id !== 'number') return [];
    const pos = Array.isArray(item.pos) ? item.pos : [];
    const x = typeof pos[0] === 'number' ? pos[0] : 0;
    const y = typeof pos[1] === 'number' ? pos[1] : 0;
    const linkIds = Array.isArray(item.linkIds)
      ? item.linkIds.filter((id): id is number => typeof id === 'number')
      : [];
    return [{ ...item, id: item.id, pos: [x, y], linkIds }];
  });
}

function readExtensions(extra: Record<string, unknown>): LinkExtension[] {
  const raw = extra[LINK_EXTENSIONS];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): LinkExtension[] =>
    isRecord(item) && typeof item.id === 'number' && typeof item.parentId === 'number'
      ? [{ id: item.id, parentId: item.parentId }]
      : [],
  );
}

export function ownRerouteIds(workflow: Workflow): ReadonlySet<number> {
  const own = ownData(workflow)?.[OWN_REROUTES];
  return new Set(
    Array.isArray(own) ? own.filter((id): id is number => typeof id === 'number') : [],
  );
}

interface Run {
  readonly x0: number;
  readonly x1: number;
}

function crossed(run: Run, left: number, right: number): boolean {
  const overlap = Math.min(right, run.x1) - Math.max(left, run.x0);
  return overlap >= (right - left) * PIERCE_COVERAGE;
}

function linkedNodes(links: ReadonlyMap<LinkId, ResolvedLink>): Set<NodeId> {
  const ids = new Set<NodeId>();
  for (const link of links.values()) {
    ids.add(link.originId);
    ids.add(link.targetId);
  }
  return ids;
}

function floorOf(
  { workflow, layout, linked }: Pick<RouteScene, 'workflow' | 'layout' | 'linked'>,
  run: Run,
  base: number,
): number {
  let bottom = base;
  for (const node of workflow.nodes) {
    if (!linked.has(node.id)) continue;
    const rect = rectOf(node, layout);
    if (crossed(run, rect.left, rect.right)) bottom = Math.max(bottom, rect.bottom);
  }
  for (const group of workflowGroups(workflow)) {
    if (!isRecord(group) || !Array.isArray(group.bounding)) continue;
    const bounding: unknown[] = group.bounding;
    const [x, y, w, h] = bounding.map((v) => (typeof v === 'number' ? v : NaN));
    if ([x, y, w, h].some((v) => v === undefined || Number.isNaN(v))) continue;
    if (crossed(run, x ?? 0, (x ?? 0) + (w ?? 0))) bottom = Math.max(bottom, (y ?? 0) + (h ?? 0));
  }
  return bottom;
}

interface Lane extends Run {
  readonly y: number;
}

function laneOf(bus: OwnBus): Lane {
  const xs = bus.members.map((reroute) => reroute.pos[0]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y: bus.head.pos[1] };
}

function clearOfBoxes(
  { rects, layout }: Pick<RouteScene, 'rects' | 'layout'>,
  [x, y]: readonly [number, number],
  direction: 1 | -1,
): number {
  const margin = layout.stackGap / 2;
  let moved = x;
  for (let guard = 0; guard <= rects.length; guard += 1) {
    const hit = rects.find(
      (r) =>
        moved > r.left - margin &&
        moved < r.right + margin &&
        y > r.top - margin &&
        y < r.bottom + margin,
    );
    if (!hit) break;
    moved = direction > 0 ? hit.right + layout.gap / 2 : hit.left - layout.gap / 2;
  }
  return moved;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function withLinkExtensionsInOrder(workflow: Workflow): Workflow {
  const extra = isRecord(workflow.extra) ? workflow.extra : null;
  const raw = extra?.[LINK_EXTENSIONS];
  if (extra === null || !Array.isArray(raw)) return workflow;
  const order = new Map([...linkIndex(workflow.links).keys()].map((id, at) => [id, at]));
  const rank = (item: unknown): number => {
    const id = isRecord(item) ? item.id : undefined;
    return typeof id === 'number' ? (order.get(id) ?? order.size) : order.size;
  };
  const sorted = [...(raw as unknown[])].sort((a, b) => rank(a) - rank(b));
  if (sorted.every((item, at) => item === raw[at])) return workflow;
  return { ...workflow, extra: { ...extra, [LINK_EXTENSIONS]: sorted } };
}

export function routeLongLinks(
  workflow: Workflow,
  layout: OrderLayout,
  changed?: ReadonlySet<NodeId>,
): Workflow {
  const extra = isRecord(workflow.extra) ? workflow.extra : {};
  const own = ownRerouteIds(workflow);
  const allReroutes = readReroutes(extra);
  const links = linkIndex(workflow.links);
  const columns = columnIndexes(workflow, layout);
  const candidates = farLinksByOutput(workflow, layout, columns);

  const keptBuses = new Map<string, OwnBus>();
  if (changed) {
    for (const [key, bus] of ownBuses(allReroutes, own, links)) {
      if (untouched(bus, candidates.get(key), changed)) keptBuses.set(key, bus);
    }
  }
  const removed = new Set(own);
  for (const bus of keptBuses.values()) for (const r of bus.members) removed.delete(r.id);

  const buses = findBuses(candidates, columns).filter((bus) => !keptBuses.has(bus.key));
  const routedLinks = new Set(buses.flatMap((bus) => bus.links.map((link) => link.id)));
  const kept = allReroutes.filter(
    (r) => !removed.has(r.id) && (r.parentId === undefined || !removed.has(r.parentId)),
  );
  const keptIds = new Set(kept.map((reroute) => reroute.id));
  const keptExtensions = readExtensions(extra).filter(
    (ext) => keptIds.has(ext.parentId) && !routedLinks.has(ext.id),
  );

  const scene: RouteScene = {
    workflow,
    layout,
    byId: new Map(workflow.nodes.map((node) => [node.id, node])),
    rects: workflow.nodes.map((node) => rectOf(node, layout)),
    linked: linkedNodes(links),
    lanes: [...keptBuses.values()].map(laneOf),
  };
  const added: Reroute[] = [];
  const addedExtensions: LinkExtension[] = [];
  let nextId = Math.max(0, ...kept.map((reroute) => reroute.id)) + 1;
  for (const bus of buses) {
    const placed = placeBus(scene, bus, nextId);
    added.push(...placed.reroutes);
    addedExtensions.push(...placed.extensions);
    nextId += placed.reroutes.length;
  }

  const linkOrder = new Map([...links.keys()].map((id, at) => [id, at]));
  const extensions = [...keptExtensions, ...addedExtensions].sort(
    (a, b) => (linkOrder.get(a.id) ?? links.size) - (linkOrder.get(b.id) ?? links.size),
  );
  const ownIds = [
    ...[...own].filter((id) => !removed.has(id)),
    ...added.map((reroute) => reroute.id),
  ];
  return writeRoutes(workflow, extra, { reroutes: [...kept, ...added], extensions, ownIds });
}

interface RouteScene {
  readonly workflow: Workflow;
  readonly layout: OrderLayout;
  readonly byId: ReadonlyMap<NodeId, WorkflowNode>;
  readonly rects: readonly NodeRect[];
  readonly linked: ReadonlySet<NodeId>;
  readonly lanes: Lane[];
}

function placeBus(
  scene: RouteScene,
  bus: Bus,
  firstId: number,
): { readonly reroutes: Reroute[]; readonly extensions: LinkExtension[] } {
  const { layout, byId } = scene;
  const reroutes: Reroute[] = [];
  const extensions: LinkExtension[] = [];
  const origin = byId.get(bus.originId);
  if (!origin) return { reroutes, extensions };
  const targets = bus.links.flatMap((link) => byId.get(link.targetId) ?? []);
  const originRect = rectOf(origin, layout);
  const run: Run = {
    x0: originRect.right + layout.gap / 2,
    x1: Math.max(...targets.map((target) => rectOf(target, layout).left - layout.gap / 2)),
  };
  const floor = floorOf(scene, run, originRect.bottom);
  const taken = (y: number): boolean =>
    scene.lanes.some(
      (lane) => lane.x0 < run.x1 && run.x0 < lane.x1 && Math.abs(lane.y - y) < layout.stackGap / 2,
    );
  let lane = 0;
  while (taken(floor + layout.stackGap * (lane + 1))) lane += 1;
  const y = floor + layout.stackGap * (lane + 1);
  scene.lanes.push({ ...run, y });

  let nextId = firstId;
  const head: Reroute = {
    id: nextId,
    pos: [clearOfBoxes(scene, [run.x0, y], 1), y],
    linkIds: bus.links.map((link) => link.id).sort((a, b) => a - b),
  };
  nextId += 1;
  reroutes.push(head);
  for (const link of bus.links) {
    const target = byId.get(link.targetId);
    if (!target) continue;
    const x = rectOf(target, layout).left - layout.gap / 2;
    reroutes.push({
      id: nextId,
      parentId: head.id,
      pos: [clearOfBoxes(scene, [x, y], -1), y],
      linkIds: [link.id],
    });
    extensions.push({ id: link.id, parentId: nextId });
    nextId += 1;
  }
  return { reroutes, extensions };
}

function writeRoutes(
  workflow: Workflow,
  extra: Record<string, unknown>,
  {
    reroutes,
    extensions,
    ownIds,
  }: {
    readonly reroutes: readonly Reroute[];
    readonly extensions: readonly LinkExtension[];
    readonly ownIds: readonly number[];
  },
): Workflow {
  const next: Record<string, unknown> = { ...extra };
  if (reroutes.length === 0) delete next[REROUTES];
  else next[REROUTES] = reroutes;
  if (extensions.length === 0) delete next[LINK_EXTENSIONS];
  else next[LINK_EXTENSIONS] = extensions;
  const written = writeOwnData(
    { ...workflow, extra: next },
    OWN_REROUTES,
    ownIds.length === 0 ? undefined : ownIds,
  );

  const unchanged =
    sameJson(next[REROUTES], extra[REROUTES]) &&
    sameJson(next[LINK_EXTENSIONS], extra[LINK_EXTENSIONS]) &&
    sameJson(ownData(written), ownData(workflow));
  return unchanged ? workflow : written;
}
