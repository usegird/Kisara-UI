import { appInputOrder } from '@/graph/app-input-order';
import { withFixedLayout } from '@/graph/fixed-layout';
import {
  groupKeyAt,
  groupLabelAt,
  groupMembership,
  groupParents,
  workflowGroups,
  type GroupLabel,
} from '@/graph/groups';
import { orderedNodeIds } from '@/graph/layout-read';
import { linkIndex } from '@/graph/link-read';
import { subgraphDefinitions } from '@/graph/normalize';
import { unlinkedNodeIds } from '@/graph/rows';
import { proxyWidgets } from '@/graph/subgraph';
import { displayLinks, withDisplayLinks, type OpenLevel } from '@/graph/subgraph-display-links';
import {
  instanceDefinition,
  openSubgraphIds,
  scopedId,
  subgraphLevel,
} from '@/graph/subgraph-level';
import {
  FRONTEND_ONLY_TYPES,
  nodeInputs,
  type LinkId,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// 表示用のワークフロー。開いた subgraph の中のノードを付け替えた id（`scopedId`）で外と並べ、カード・
// 変数・線を外と同じ組み立てで作れるようにする。編集には使わない（編集は `subgraph-level` の階層で行う）。
// ─────────────────────────────

/** 開いた subgraph の枠 1 つ */
export interface SubgraphFrame {
  readonly instanceId: NodeId;
  /** 定義の名前 */
  readonly name: string;
  /** 同じ定義を使うインスタンスの数（外と全部の定義の中を数える） */
  readonly uses: number;
  /** 中のノードのグループの所属（`groupLabels` の添字） */
  readonly membership: ReadonlyMap<NodeId, number>;
  /**
   * 中のグループの親（`groupLabels` の添字）
   */
  readonly parents: ReadonlyMap<number, number>;
  /** 中のグループの名前・色。鍵は `innerGroupKey` の形 */
  readonly groupLabels: readonly GroupLabel[];
}

/**
 * 表示用のワークフローと、開いた枠・昇格した入力の行き先。並び・所属・通し番号は作ったときに
 * 求めて `fixed-layout` で添える
 */
export interface DisplayGraph {
  readonly workflow: Workflow;
  /** 開いているインスタンス → 枠 */
  readonly frames: ReadonlyMap<NodeId, SubgraphFrame>;
  /**
   * インスタンスの昇格した入力（`${インスタンス}:${widget 名}`）→ 中の行。
   * アプリ入力からの線を中の行へ引く
   */
  readonly proxyRows: ReadonlyMap<string, { readonly nodeId: NodeId; readonly widgetName: string }>;
}

/** 中のグループの鍵。`<インスタンス>/<中の鍵>`（外のグループの鍵と重ならない） */
function innerGroupKey(instanceId: NodeId, key: string): string {
  return `${String(instanceId)}/${key}`;
}

/** 中のグループの鍵を、インスタンスと中の鍵に分ける。外のグループの鍵なら null */
export function splitInnerGroupKey(
  key: string,
): { readonly instanceId: NodeId; readonly key: string } | null {
  const at = key.indexOf('/');
  if (at < 0) return null;
  const instanceId = Number(key.slice(0, at));
  return Number.isInteger(instanceId) ? { instanceId, key: key.slice(at + 1) } : null;
}

/** 昇格した入力の鍵 */
export function proxyRowKey(instanceId: NodeId, widgetName: string): string {
  return `${String(instanceId)}:${widgetName}`;
}

const NO_FRAMES: ReadonlyMap<NodeId, SubgraphFrame> = new Map();
const NO_PROXY_ROWS: DisplayGraph['proxyRows'] = new Map();

const cache = new WeakMap<Workflow, DisplayGraph>();

/** 開いたインスタンスは線を外し、出力を持たせない（枠の見出しとアプリ入力の行だけに使う） */
function asFrameHead(node: WorkflowNode): WorkflowNode {
  const inputs = Array.isArray(node.inputs)
    ? nodeInputs(node).map((input) => (input.link === null ? input : { ...input, link: null }))
    : undefined;
  return { ...node, ...(inputs ? { inputs } : {}), outputs: [] };
}

/** 同じ定義を使うインスタンスの数 */
function usesOf(workflow: Workflow, definitionId: string): number {
  const nodes = [
    ...workflow.nodes,
    ...subgraphDefinitions(workflow).flatMap((definition) => definition.nodes),
  ];
  return nodes.filter((node) => node.type === definitionId).length;
}

/** カードにするノードか（中継点はカードにしない。rows の `cardNodes` と同じ） */
function isCard(node: WorkflowNode | undefined): boolean {
  return node !== undefined && node.type !== FRONTEND_ONLY_TYPES.reroute;
}

/** 中のグループの名前・色。鍵はインスタンスを混ぜた形 */
function innerLabels(instanceId: NodeId, level: Workflow): GroupLabel[] {
  return workflowGroups(level).map((_, index) => {
    const label = groupLabelAt(level, index);
    return { ...label, key: innerGroupKey(instanceId, groupKeyAt(level, index)) };
  });
}

/**
 * アプリ入力にした昇格の入力を、中の行にも印として写す（表示だけ）。中の行はカードで 1 行に縮み、
 * 左の列からの線の終点になる（外のインスタンスのカードと同じ見え方）
 */
function withProxyAppInputs(
  workflow: Workflow,
  proxyRows: DisplayGraph['proxyRows'],
): Workflow['extra'] {
  const added = appInputOrder(workflow).flatMap((ref) => {
    const inner = proxyRows.get(proxyRowKey(ref.nodeId, ref.widgetName));
    return inner ? [[inner.nodeId, inner.widgetName]] : [];
  });
  if (added.length === 0) return workflow.extra;
  const extra = isRecord(workflow.extra) ? workflow.extra : {};
  const linear = isRecord(extra.linearData) ? extra.linearData : {};
  const inputs: unknown[] = isUnknownArray(linear.inputs) ? linear.inputs : [];
  return { ...extra, linearData: { ...linear, inputs: [...inputs, ...added] } };
}

function build(workflow: Workflow): DisplayGraph {
  const open = openSubgraphIds(workflow);
  if (open.length === 0) return { workflow, frames: NO_FRAMES, proxyRows: NO_PROXY_ROWS };

  const levels = new Map<NodeId, OpenLevel>();
  for (const instanceId of open) {
    const definition = instanceDefinition(workflow, instanceId);
    const level = subgraphLevel(workflow, instanceId);
    if (!definition || !level) continue;
    levels.set(instanceId, { definition, level, links: [...linkIndex(level.links).values()] });
  }

  const links = displayLinks(workflow, levels);
  const index = linkIndex(links);
  const outgoing = new Map<string, LinkId[]>();
  for (const link of index.values()) {
    const key = `${String(link.originId)}:${String(link.originSlot)}`;
    outgoing.set(key, [...(outgoing.get(key) ?? []), link.id]);
  }

  const rootOrder = orderedNodeIds(workflow);
  const rootById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const order: NodeId[] = [];
  const numbers = new Map<NodeId, string>();
  // 中のノードは、変数の列ではインスタンスと同じ外のグループに入る（帯を割らない）
  const membership = groupMembership(workflow);
  const frames = new Map<NodeId, SubgraphFrame>();
  const proxyRows = new Map<string, { readonly nodeId: NodeId; readonly widgetName: string }>();
  const nodes: WorkflowNode[] = [];

  let count = 0;
  for (const id of rootOrder) {
    order.push(id);
    const node = rootById.get(id);
    if (isCard(node)) numbers.set(id, String(++count));
    const open = levels.get(id);
    if (!open || !node) continue;

    const innerById = new Map(open.level.nodes.map((inner) => [inner.id, inner]));
    let innerCount = 0;
    const outer = membership.get(id);
    for (const innerId of orderedNodeIds(open.level)) {
      order.push(innerId);
      if (isCard(innerById.get(innerId))) {
        numbers.set(innerId, `${String(count)}.${String(++innerCount)}`);
      }
      if (outer !== undefined) membership.set(innerId, outer);
    }
    nodes.push(...open.level.nodes);
    frames.set(id, {
      instanceId: id,
      name: open.definition.name,
      uses: usesOf(workflow, open.definition.id),
      membership: groupMembership(open.level),
      parents: groupParents(open.level),
      groupLabels: innerLabels(id, open.level),
    });
    for (const proxy of proxyWidgets(node)) {
      proxyRows.set(proxyRowKey(id, proxy.widget), {
        nodeId: scopedId(id, proxy.nodeId),
        widgetName: proxy.widget,
      });
    }
  }

  const display: Workflow = {
    ...workflow,
    nodes: [
      ...workflow.nodes.map((node) => (levels.has(node.id) ? asFrameHead(node) : node)),
      ...nodes,
    ].map((node) => withDisplayLinks(node, index, outgoing)),
    links,
    extra: withProxyAppInputs(workflow, proxyRows),
  };
  return {
    workflow: withFixedLayout(display, {
      order,
      membership,
      parents: groupParents(workflow),
      numbers,
    }),
    frames,
    proxyRows,
  };
}

/** 表示用のワークフロー。開いたものが無ければ元のワークフローそのもの。同じ入力なら同じものを返す */
export function displayGraph(workflow: Workflow): DisplayGraph {
  const cached = cache.get(workflow);
  if (cached) return cached;
  const graph = build(workflow);
  cache.set(workflow, graph);
  return graph;
}

/**
 * 隠してよいノード（どこにも繋がっていないもの）。外は元のワークフローで、開いた中は表示の線で数える
 * （開いたインスタンスは表示では線を外してあるが、隠さない）
 */
export function unlinkedDisplayIds(workflow: Workflow): ReadonlySet<NodeId> {
  const outer = unlinkedNodeIds(workflow);
  const display = displayGraph(workflow);
  if (display.frames.size === 0) return outer;
  const root = new Set(workflow.nodes.map((node) => node.id));
  const inner = [...unlinkedNodeIds(display.workflow)].filter((id) => !root.has(id));
  return new Set([...outer, ...inner]);
}
