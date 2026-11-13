import { remapAppInputs } from '@/graph/app-inputs';
import {
  groupMembership,
  groupParents,
  groupSubtree,
  withoutGroups,
  workflowGroups,
} from '@/graph/groups';
import { shiftInsertGroup, shiftRemove } from '@/graph/layout-shift';
import { DEFAULT_ORDER_LAYOUT, type OrderLayout } from '@/graph/node-box';
import { subgraphDefinitions } from '@/graph/normalize';
import { routeLongLinks } from '@/graph/reroutes';
import { proxyWidgets } from '@/graph/subgraph';
import {
  boundaryPorts,
  innerLinksOf,
  liveLinks,
  relink,
  splitLinks,
  uuid,
} from '@/graph/subgraph-convert-links';
import {
  instanceDefinition,
  openSubgraphIds,
  setSubgraphOpen,
  withCounters,
  withGroupCounter,
} from '@/graph/subgraph-level';
import {
  createDefinition,
  createInstance,
  groupMembers,
  keepsOuterLink,
  outerLinksOf,
  swapGroupForInstance,
} from '@/graph/subgraph-pack';
import {
  isStillUsed,
  keepsRootLink,
  movedNodes,
  unpackedLinks,
  unpackGroups,
  type UnpackContext,
} from '@/graph/subgraph-unpack';
import { nodeInputs, type NodeId, type Workflow, type WorkflowLink } from '@/graph/types';
import { lastGroupIdOf, lastLinkIdOf, lastNodeIdOf } from '@/graph/workflow-ids';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// グループと subgraph の変換。本体の「Convert to Subgraph」「Unpack Subgraph」と同じ形で書く。
// どちらも外の階層だけで、位置は変更箇所だけを動かす。
// ─────────────────────────────

/**
 * グループを subgraph にする。中のノード・子のグループと
 * グループ自身を新しい定義へ移し、グループのあった並びの位置にインスタンスを置く。できなければ null
 */
export function groupToSubgraph(
  workflow: Workflow,
  groupIndex: number,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): { readonly workflow: Workflow; readonly instanceId: NodeId } | null {
  const group = workflowGroups(workflow)[groupIndex];
  if (!isRecord(group)) return null;
  const parents = groupParents(workflow);
  const subtree = groupSubtree(groupIndex, parents);
  const members = groupMembers(workflow, groupIndex, parents, layout);
  if (members.size === 0) return null;

  const inside = (id: NodeId): boolean => members.has(id);
  const split = splitLinks(liveLinks(workflow), members);
  const { inputs, outputs } = boundaryPorts(workflow, split);

  // 定義の中の線: 中どうし・入口から出る線（id はそのまま）・出口へ入る線（出どころごとに 1 本）
  const innerLinks = innerLinksOf(split.internal, inputs, outputs);
  const innerNodes = relink(
    workflow.nodes.filter((node) => inside(node.id)),
    innerLinks,
    members,
  );

  // 採番（外と全部の定義で共有）
  const instanceId = lastNodeIdOf(workflow) + 1;
  const definitionId = uuid();
  const outer = outerLinksOf(inputs, outputs, instanceId, lastLinkIdOf(workflow));

  // アプリ入力: メンバーの値はインスタンスの昇格した入力へ（同じ名前は先のものだけ）
  const proxies: [string, string][] = [];
  const definition = createDefinition(
    {
      id: definitionId,
      name: typeof group.title === 'string' && group.title.length > 0 ? group.title : '',
      nodes: innerNodes,
      links: innerLinks,
      inputs,
      outputs,
      groups: workflowGroups(workflow).filter((_, index) => subtree.has(index)),
    },
    { lastGroupId: lastGroupIdOf(workflow), lastNode: instanceId, lastLink: outer.lastLink },
    layout,
  );
  const instance = createInstance(instanceId, definitionId, { inputs, outputs, outer, proxies });

  const closed = swapGroupForInstance(workflow, { instance, groupIndex, parents }, layout);
  const removedIds = new Set(
    [...split.internal, ...split.incoming, ...split.outgoing].map(({ link }) => link.id),
  );
  const links = [
    ...closed.links.filter((raw) => keepsOuterLink(raw, removedIds, inside)),
    ...outer.incoming.filter((link): link is WorkflowLink => link !== null),
    ...outer.outgoing,
  ];
  const touched = new Set<NodeId>([
    instanceId,
    ...split.incoming.map(({ link }) => link.originId),
    ...split.outgoing.map(({ link }) => link.targetId),
  ]);
  const dropped = withoutGroups(closed, subtree).workflow;
  let next: Workflow = {
    ...dropped,
    nodes: relink(
      closed.nodes.filter((node) => !inside(node.id)),
      links,
      touched,
    ),
    links,
    definitions: {
      ...workflow.definitions,
      subgraphs: [...subgraphDefinitions(workflow), definition],
    },
  };
  next = remapAppInputs(next, (ref) => {
    if (!inside(ref.nodeId)) return ref;
    if (proxies.some(([, widget]) => widget === ref.widgetName)) return null;
    proxies.push([String(ref.nodeId), ref.widgetName]);
    return { nodeId: instanceId, widgetName: ref.widgetName };
  });
  // 開いていたメンバーの subgraph は中に入るので閉じる
  for (const id of openSubgraphIds(workflow))
    if (inside(id)) next = setSubgraphOpen(next, id, false);

  // 線が変わったノードの束だけ、線の中継を置き直す
  const placed = routeLongLinks(next, layout, touched);
  return { workflow: withCounters(placed, instanceId, outer.lastLink), instanceId };
}

// ─────────────────────────────
// subgraph → グループ
// ─────────────────────────────

/**
 * subgraph のインスタンスをグループに戻す。中のノードに新しい id を
 * 振って外へ出し、1 つのグループにまとめる。中のグループは子のグループとして親子のまま持ち出す。
 * できなければ null
 */
export function subgraphToGroup(
  workflow: Workflow,
  instanceId: NodeId,
  layout: OrderLayout = DEFAULT_ORDER_LAYOUT,
): Workflow | null {
  const definition = instanceDefinition(workflow, instanceId);
  const instance = workflow.nodes.find((node) => node.id === instanceId);
  if (!definition || !instance || definition.nodes.length === 0) return null;
  const start = setSubgraphOpen(workflow, instanceId, false);

  let lastNode = lastNodeIdOf(start);
  let lastLink = lastLinkIdOf(start);
  const idMap = new Map(definition.nodes.map((node) => [node.id, ++lastNode]));
  const newIds = new Set(idMap.values());
  const map = (id: NodeId): NodeId | undefined => idMap.get(id);

  const rootLive = liveLinks(start);
  const intoInstance = rootLive.filter(({ link }) => link.targetId === instanceId);
  const fromInstance = rootLive.filter(({ link }) => link.originId === instanceId);
  const context: UnpackContext = {
    definition,
    instanceInputs: nodeInputs(instance),
    intoInstance,
    fromInstance,
    map,
  };
  const created = definition.links.flatMap((raw) => unpackedLinks(raw, context, () => ++lastLink));

  const { moved, origin } = movedNodes(definition, map, layout);
  const { groups, groupIndex, tree, lastGroupId } = unpackGroups(
    start,
    { definition, instance, origin, map },
    layout,
  );

  const removedIds = new Set([...intoInstance, ...fromInstance].map(({ link }) => link.id));
  const links = [
    ...start.links.filter((raw) => keepsRootLink(raw, removedIds, instanceId)),
    ...created,
  ];
  const touched = new Set<NodeId>([
    ...newIds,
    ...intoInstance.map(({ link }) => link.originId),
    ...fromInstance.map(({ link }) => link.targetId),
  ]);
  // インスタンスは置き場所を決めるまで残す（先に抜くと、親のグループが空になって消えたとき、
  // 入れる先が無くなる）
  let next: Workflow = {
    ...start,
    nodes: relink([...start.nodes, ...moved], links, touched),
    links,
    groups,
    definitions: {
      ...start.definitions,
      subgraphs: isStillUsed(start, instanceId, definition.id)
        ? subgraphDefinitions(start)
        : subgraphDefinitions(start).filter((d) => d.id !== definition.id),
    },
  };
  next = withGroupCounter(next, lastGroupId);
  // アプリ入力: インスタンスの昇格した入力は、出したノードの入力へ
  const proxyTo = new Map(
    proxyWidgets(instance).map((proxy) => [proxy.widget, map(proxy.nodeId)] as const),
  );
  next = remapAppInputs(next, (ref) => {
    if (ref.nodeId !== instanceId) return ref;
    const to = proxyTo.get(ref.widgetName);
    return to === undefined ? null : { nodeId: to, widgetName: ref.widgetName };
  });

  // 並びの位置: インスタンスの手前にグループの箱を入れてから、インスタンスを抜いて詰める
  const container = groupMembership(start, layout).get(instanceId) ?? null;
  const opened = shiftInsertGroup(
    next,
    { nodeIds: [...newIds], group: groupIndex, inner: tree },
    { container, beside: { kind: 'node', id: instanceId }, side: 'before' },
    layout,
  );
  const closed = shiftRemove(opened, { kind: 'node', id: instanceId }, layout);
  const placed = { ...closed, nodes: closed.nodes.filter((node) => node.id !== instanceId) };
  return withCounters(placed, lastNode, lastLink);
}
