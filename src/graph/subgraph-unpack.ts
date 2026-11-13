import { groupMembership, groupParents, lineage, newGroup, workflowGroups } from '@/graph/groups';
import { readLink } from '@/graph/link-read';
import { positionOf, rectOf, type OrderLayout } from '@/graph/node-box';
import { subgraphDefinitions } from '@/graph/normalize';
import { rawType, type LiveLink } from '@/graph/subgraph-convert-links';
import {
  nodeInputs,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';
import { lastGroupIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// subgraph → グループの部品。定義の線とノード・中のグループを外の階層へ持ち出す形にする。
// ─────────────────────────────

/** 定義の中のグループ（持ち出すもの）と、中の所属・親。添字は定義の `groups` のもの */
interface InnerGroups {
  readonly groups: readonly Record<string, unknown>[];
  readonly membership: ReadonlyMap<NodeId, number>;
  readonly parents: ReadonlyMap<number, number>;
  /** 中のノードを全部囲む、いちばん外側のグループ（1 つだけのとき）。無ければ null */
  readonly wrapping: number | null;
}

/** 定義の線を外へ出すときに見るもの */
export interface UnpackContext {
  readonly definition: SubgraphDefinition;
  readonly instanceInputs: ReturnType<typeof nodeInputs>;
  readonly intoInstance: readonly LiveLink[];
  readonly fromInstance: readonly LiveLink[];
  /** 中のノードの id → 外での新しい id */
  readonly map: (id: NodeId) => NodeId | undefined;
}

/**
 * 定義の線 1 本を、外へ出した後の線にする。入口からの線は外の出どころから直に、出口への線は
 * 外の受け手それぞれへ、中どうしは新しい id どうしで結ぶ。結べなければ空
 */
export function unpackedLinks(
  raw: WorkflowLink,
  context: UnpackContext,
  nextLinkId: () => LinkId,
): WorkflowLink[] {
  const link = readLink(raw);
  if (!link) return [];
  const { definition, map } = context;
  if (link.originId === SUBGRAPH_IO_NODE_ID.input) {
    // 入口 → 外の出どころから直に
    const name = definition.inputs?.[link.originSlot]?.name;
    const slot = context.instanceInputs.findIndex((input) => input.name === name);
    const outer = context.intoInstance.find(({ link: l }) => l.targetSlot === slot)?.link;
    const target = map(link.targetId);
    if (!outer || target === undefined) return [];
    return [
      [nextLinkId(), outer.originId, outer.originSlot, target, link.targetSlot, rawType(raw)],
    ];
  }
  if (link.targetId === SUBGRAPH_IO_NODE_ID.output) {
    // 中の出どころ → 出口 → 外の受け手それぞれへ
    const origin = map(link.originId);
    if (origin === undefined) return [];
    return context.fromInstance
      .filter(({ link: l }) => l.originSlot === link.targetSlot)
      .map(({ link: outer }): WorkflowLink => [
        nextLinkId(),
        origin,
        link.originSlot,
        outer.targetId,
        outer.targetSlot,
        rawType(raw),
      ]);
  }
  const origin = map(link.originId);
  const target = map(link.targetId);
  if (origin === undefined || target === undefined) return [];
  return [[nextLinkId(), origin, link.originSlot, target, link.targetSlot, rawType(raw)]];
}

/** 中のノードに新しい id を振り、位置は箱の左上を原点に寄せる（置き場所は後で決める） */
export function movedNodes(
  definition: SubgraphDefinition,
  map: (id: NodeId) => NodeId | undefined,
  layout: OrderLayout,
): { readonly moved: WorkflowNode[]; readonly origin: readonly [number, number] } {
  const rects = definition.nodes.map((node) => rectOf(node, layout));
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const moved: WorkflowNode[] = definition.nodes.map((node) => {
    const [x, y] = positionOf(node);
    return { ...node, id: map(node.id) ?? node.id, pos: [x - left, y - top] };
  });
  return { moved, origin: [left, top] };
}

/**
 * 戻した後のグループの一覧と、中のノードをまとめるグループ・その中の所属と親。
 * 中のグループは親子のまま持ち出す（id は振り直す）。中を全部囲むものが 1 つだけなら、
 * それをまとめるグループにする。無ければ包むグループを足す（名前はコメントか定義の名前）
 */
export function unpackGroups(
  start: Workflow,
  {
    definition,
    instance,
    origin,
    map,
  }: {
    readonly definition: SubgraphDefinition;
    readonly instance: WorkflowNode;
    readonly origin: readonly [number, number];
    readonly map: (id: NodeId) => NodeId | undefined;
  },
  layout: OrderLayout,
): {
  readonly groups: unknown[];
  readonly groupIndex: number;
  readonly tree: ReturnType<typeof insertedTreeOf>;
  readonly lastGroupId: number;
} {
  const inner = innerGroupsOf(start, definition, layout);
  const base = workflowGroups(start).length;
  // 番号は外と全部の定義で共有する数えの次から配る（本体と同じ）
  let lastGroupId = lastGroupIdOf(start);
  const carried = inner.groups.map((group) => carriedGroup(group, ++lastGroupId, origin));
  const comment =
    typeof instance.title === 'string' && instance.title.length > 0 ? instance.title : null;
  const wrapper: Record<string, unknown> | null =
    inner.wrapping === null
      ? { ...newGroup(start), id: ++lastGroupId, title: comment ?? definition.name }
      : null;
  const groupIndex = inner.wrapping === null ? base + carried.length : base + inner.wrapping;
  return {
    groups: [...workflowGroups(start), ...carried, ...(wrapper ? [wrapper] : [])],
    groupIndex,
    tree: insertedTreeOf(inner, { base, groupIndex, carried: carried.length }, map),
    lastGroupId,
  };
}

function innerGroupsOf(
  workflow: Workflow,
  definition: SubgraphDefinition,
  layout: OrderLayout,
): InnerGroups {
  const groups = workflowGroups(definition).map((group) => (isRecord(group) ? group : {}));
  // 定義の中を 1 つの階層として読む（位置から所属と親を求める）
  const level: Workflow = { ...workflow, nodes: definition.nodes, links: [], groups };
  const membership = groupMembership(level, layout);
  const parents = groupParents(level);
  const tops = groups.flatMap((_, index) =>
    !parents.has(index) &&
    definition.nodes.every((node) => lineage(membership.get(node.id), parents).includes(index))
      ? [index]
      : [],
  );
  return { groups, membership, parents, wrapping: tops.length === 1 ? (tops[0] ?? null) : null };
}

/** 持ち出す中のグループ 1 つ。id を振り直し、箱を中のノードと同じだけずらす */
function carriedGroup(
  group: Record<string, unknown>,
  id: number,
  [left, top]: readonly [number, number],
): Record<string, unknown> {
  const bounding = isUnknownArray(group.bounding) ? group.bounding : null;
  const [x, y, ...size] = bounding ?? [];
  return {
    ...group,
    id,
    ...(typeof x === 'number' && typeof y === 'number'
      ? { bounding: [x - left, y - top, ...size] }
      : {}),
  };
}

/** 入れるグループの中の所属と親（外の添字で。まとめるグループの直下は載せない） */
function insertedTreeOf(
  inner: InnerGroups,
  { base, groupIndex, carried }: { base: number; groupIndex: number; carried: number },
  map: (id: NodeId) => NodeId | undefined,
): { membership: Map<NodeId, number>; parents: Map<number, number> } {
  return {
    membership: new Map(
      [...inner.membership].flatMap(([id, group]) => {
        const to = map(id);
        return to === undefined ? [] : [[to, base + group] as const];
      }),
    ),
    parents: new Map(
      Array.from({ length: carried }, (_, index) => index).flatMap((index) => {
        if (base + index === groupIndex) return [];
        const parent = inner.parents.get(index);
        return [[base + index, parent === undefined ? groupIndex : base + parent] as const];
      }),
    ),
  };
}

/** 外に残す線か（消した線と、インスタンスにつながる線を落とす） */
export function keepsRootLink(
  raw: WorkflowLink,
  removedIds: ReadonlySet<LinkId>,
  instanceId: NodeId,
): boolean {
  const link = readLink(raw);
  return (
    link !== null &&
    !removedIds.has(link.id) &&
    link.originId !== instanceId &&
    link.targetId !== instanceId
  );
}

/** 戻すインスタンスのほかに、同じ定義を使うノードが（外か定義の中に）残っているか */
export function isStillUsed(workflow: Workflow, instanceId: NodeId, definitionId: string): boolean {
  return [
    ...workflow.nodes.filter((node) => node.id !== instanceId),
    ...subgraphDefinitions(workflow).flatMap((d) => d.nodes),
  ].some((node) => node.type === definitionId);
}
