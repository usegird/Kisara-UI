import { readLink } from '@/graph/link-read';
import { subgraphDefinitions } from '@/graph/normalize';
import { ownData, writeOwnData } from '@/graph/own-data';
import {
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type SubgraphIo,
  type Workflow,
  type WorkflowLink,
  type WorkflowLinkObject,
  type WorkflowNode,
} from '@/graph/types';
import { lastGroupIdOf, lastLinkIdOf, lastNodeIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// 開いた subgraph の中を 1 つの Workflow の形（階層）として取り出し、変えたものを定義へ書き戻す
// （中も外と同じ規則・同じ純関数で扱うため）。id の付け替えと開閉も置く。
// ─────────────────────────────

/** 階層の中の番号に、インスタンスの中の id を入れるビット数 */
const SCOPE_BITS = 20;

/**
 * 付け替えた番号の幅。外のノード・線の id はこれより小さいものとする（本体の採番は 1 から順に進む）。
 * 中のノードと線の id は定義どうしで重なり、同じ定義を 2 か所で開くこともあるので、階層の中では
 * インスタンスの id を混ぜた番号に付け替える
 */
const SCOPE_SPAN = 2 ** SCOPE_BITS;

/**
 * インスタンスの中の id を、階層の中の番号にする。入口と出口の仮想ノード（`-10` / `-20`）は
 * 付け替えない（相手の無い線として、結線の操作はそのまま素通しにする）
 */
export function scopedId(instanceId: NodeId, innerId: number): number {
  return innerId < 0 ? innerId : (instanceId + 1) * SCOPE_SPAN + innerId;
}

/** 付け替えた番号を、インスタンスと中の id に戻す。付け替えた番号でなければ null */
export function unscopedId(
  id: number,
): { readonly instanceId: NodeId; readonly innerId: number } | null {
  if (!Number.isInteger(id) || id < SCOPE_SPAN) return null;
  return { instanceId: Math.floor(id / SCOPE_SPAN) - 1, innerId: id % SCOPE_SPAN };
}

/** その id が属する階層（開いたインスタンスの id）。外なら null */
export function levelOfId(id: number): NodeId | null {
  return unscopedId(id)?.instanceId ?? null;
}

/** 実行の id（`12` / `12:34`）を、開いている中ならその中のカードの id にする */
export function openCardIdOf(promptNodeId: string, open: ReadonlySet<NodeId>): NodeId | null {
  const [head, inner] = promptNodeId.split(':');
  const id = Number(head);
  if (head === undefined || head.length === 0 || !Number.isInteger(id)) return null;
  const innerId = Number(inner);
  return open.has(id) && inner !== undefined && Number.isInteger(innerId)
    ? scopedId(id, innerId)
    : id;
}

// ─────────────────────────────
// 開閉の状態（`extra.kisara.openSubgraphs`）
// ─────────────────────────────

const OPEN_SUBGRAPHS = 'openSubgraphs';

/** インスタンスの定義。外のノードで、定義が引けるものだけ */
export function instanceDefinition(
  workflow: Workflow,
  instanceId: NodeId,
): SubgraphDefinition | null {
  const node = workflow.nodes.find((candidate) => candidate.id === instanceId);
  if (!node) return null;
  return subgraphDefinitions(workflow).find((definition) => definition.id === node.type) ?? null;
}

/** 開いているインスタンス（外のノードで、定義が引けるもの）。書いてある順 */
export function openSubgraphIds(workflow: Workflow): NodeId[] {
  const raw = ownData(workflow)?.[OPEN_SUBGRAPHS];
  if (!isUnknownArray(raw)) return [];
  const ids = raw.filter((id): id is number => typeof id === 'number');
  return [...new Set(ids)].filter((id) => instanceDefinition(workflow, id) !== null);
}

/** 開く・閉じる。変わらなければ同じものを返す。開いているものが無ければ項目ごと消す */
export function setSubgraphOpen(workflow: Workflow, instanceId: NodeId, open: boolean): Workflow {
  const current = openSubgraphIds(workflow);
  if (current.includes(instanceId) === open) return workflow;
  if (open && instanceDefinition(workflow, instanceId) === null) return workflow;

  const next = open ? [...current, instanceId] : current.filter((id) => id !== instanceId);
  return withOpenSubgraphs(workflow, next);
}

/**
 * 開いているものを差し替える（取り消しで戻したワークフローに、今の開閉を写す）。
 * 同じなら同じものを返す
 */
export function withOpenSubgraphs(workflow: Workflow, ids: readonly NodeId[]): Workflow {
  const current = ownData(workflow)?.[OPEN_SUBGRAPHS];
  const same = isUnknownArray(current)
    ? current.length === ids.length && current.every((id, at) => id === ids[at])
    : ids.length === 0;
  if (same) return workflow;
  return writeOwnData(workflow, OPEN_SUBGRAPHS, ids.length === 0 ? undefined : [...ids]);
}

/** グループの数えを `to` まで進める（外の `state` と、全部の定義の `state`。書いてある数だけ） */
export function withGroupCounter(workflow: Workflow, to: number): Workflow {
  const bump = (state: unknown): unknown => {
    if (!isRecord(state) || typeof state.lastGroupId !== 'number') return state;
    return state.lastGroupId < to ? { ...state, lastGroupId: to } : state;
  };
  const definitions = subgraphDefinitions(workflow);
  const subgraphs = definitions.map((definition) => {
    const state = bump(definition.state);
    return state === definition.state ? definition : { ...definition, state };
  });
  const state = bump(workflow.state);
  const changed = state !== workflow.state || subgraphs.some((d, at) => d !== definitions[at]);
  if (!changed) return workflow;
  return {
    ...workflow,
    ...(state === workflow.state ? {} : { state }),
    ...(workflow.definitions ? { definitions: { ...workflow.definitions, subgraphs } } : {}),
  };
}

// ─────────────────────────────
// 付け替え
// ─────────────────────────────

/** 入出力の口の線の番号を付け替える。口の形は読んだまま保つ */
function mapSlots(raw: unknown, key: 'link' | 'links', map: (id: number) => number): unknown {
  if (!Array.isArray(raw)) return raw;
  return (raw as unknown[]).map((slot) => {
    if (!isRecord(slot)) return slot;
    const value = slot[key];
    if (typeof value === 'number') return { ...slot, [key]: map(value) };
    if (Array.isArray(value)) {
      return {
        ...slot,
        [key]: (value as unknown[]).map((id) => (typeof id === 'number' ? map(id) : id)),
      };
    }
    return slot;
  });
}

function mapNode(node: WorkflowNode, map: (id: number) => number): WorkflowNode {
  const next: WorkflowNode = { ...node, id: map(node.id) };
  if (Array.isArray(node.inputs)) next.inputs = mapSlots(node.inputs, 'link', map);
  if (Array.isArray(node.outputs)) next.outputs = mapSlots(node.outputs, 'links', map);
  return next;
}

/** 線を定義の形（キー付き）にする。元にあったキーは保つ */
function mapLink(
  link: WorkflowLink,
  map: (id: number) => number,
  original?: WorkflowLinkObject,
): WorkflowLinkObject | null {
  const resolved = readLink(link);
  if (!resolved) return null;
  const type = Array.isArray(link) ? link[5] : link.type;
  return {
    ...original,
    ...(Array.isArray(link) ? {} : link),
    id: map(resolved.id),
    origin_id: map(resolved.originId),
    origin_slot: resolved.originSlot,
    target_id: map(resolved.targetId),
    target_slot: resolved.targetSlot,
    type,
  };
}

// ─────────────────────────────
// 階層の取り出しと書き戻し
// ─────────────────────────────

/**
 * インスタンスの中を、外と同じ純関数に渡せる形（階層）にする。id は `scopedId` に付け替える。
 * 定義（`definitions`）はそのまま持たせる（中にある閉じた subgraph の値の書き込みに使う）。
 * 採番は全体で共有している数から続ける。インスタンスか定義が無ければ null
 */
export function subgraphLevel(workflow: Workflow, instanceId: NodeId): Workflow | null {
  const definition = instanceDefinition(workflow, instanceId);
  if (!definition) return null;
  const map = (id: number): number => scopedId(instanceId, id);

  return {
    nodes: definition.nodes.map((node) => mapNode(node, map)),
    links: definition.links.flatMap((link) => mapLink(link, map) ?? []),
    groups: isUnknownArray(definition.groups) ? definition.groups : [],
    extra: {},
    ...(workflow.definitions ? { definitions: workflow.definitions } : {}),
    last_node_id: map(lastNodeIdOf(workflow)),
    last_link_id: map(lastLinkIdOf(workflow)),
    // グループの番号は外と共有する数えから続ける（書き戻すときに外へ返す）
    state: { lastGroupId: lastGroupIdOf(workflow) },
  };
}

/** 入口・出口の口の線の並びを、中の線から求め直す。元の順は保ち、足したものは後ろへ */
function withIoLinks(
  ios: readonly SubgraphIo[] | undefined,
  links: readonly WorkflowLinkObject[],
  side: 'input' | 'output',
): SubgraphIo[] | undefined {
  if (!ios) return undefined;
  return ios.map((io, slot) => {
    const ids = links
      .filter((link) =>
        side === 'input'
          ? link.origin_id === SUBGRAPH_IO_NODE_ID.input && link.origin_slot === slot
          : link.target_id === SUBGRAPH_IO_NODE_ID.output && link.target_slot === slot,
      )
      .map((link) => link.id);
    const kept = (io.linkIds ?? []).filter((id) => ids.includes(id));
    const added = ids.filter((id) => !kept.includes(id));
    const linkIds = [...kept, ...added];
    const same =
      linkIds.length === (io.linkIds ?? []).length &&
      linkIds.every((id, at) => io.linkIds?.[at] === id);
    return same ? io : { ...io, linkIds };
  });
}

/** 採番の数を、使った分まで進める（外の `last_*` と、全部の定義の `state`） */
export function withCounters(workflow: Workflow, lastNode: number, lastLink: number): Workflow {
  // 書いてある数だけ進める（無いキーは足さない）
  const bump = (value: unknown, to: number): unknown =>
    typeof value === 'number' && value < to ? to : value;
  const definitions = subgraphDefinitions(workflow).map((definition) => {
    const state = definition.state;
    if (!isRecord(state)) return definition;
    const nodeId = bump(state.lastNodeId, lastNode);
    const linkId = bump(state.lastLinkId, lastLink);
    if (nodeId === state.lastNodeId && linkId === state.lastLinkId) return definition;
    return { ...definition, state: { ...state, lastNodeId: nodeId, lastLinkId: linkId } };
  });
  return {
    ...workflow,
    last_node_id: bump(workflow.last_node_id, lastNode),
    last_link_id: bump(workflow.last_link_id, lastLink),
    definitions: { ...workflow.definitions, subgraphs: definitions },
  };
}

/**
 * 階層で変えたものを定義へ書き戻す。id を元に戻し、線は定義の形（キー付き）にし、
 * 入口と出口の線の並びを求め直す。**`extra` は書き戻さない**（中では線の中継を置かない。
 * 本体が subgraph の中の中継点をどこに持つかを確かめていないため）
 */
export function writeSubgraphLevel(
  workflow: Workflow,
  instanceId: NodeId,
  level: Workflow,
): Workflow {
  const before = instanceDefinition(workflow, instanceId);
  if (!before) return workflow;
  const unmap = (id: number): number => {
    const scoped = unscopedId(id);
    return scoped?.instanceId === instanceId ? scoped.innerId : id;
  };

  // 中にある閉じた subgraph の値の書き込みは、階層の定義の方に入っている
  const base: Workflow = level.definitions
    ? { ...workflow, definitions: level.definitions }
    : workflow;
  const definitions = subgraphDefinitions(base);
  const at = definitions.findIndex((definition) => definition.id === before.id);
  const definition = definitions[at];
  if (!definition) return workflow;

  const originals = new Map<LinkId, WorkflowLinkObject>();
  for (const link of definition.links) {
    if (!Array.isArray(link)) originals.set(link.id, link);
  }
  const links = level.links.flatMap((link) => {
    const id = readLink(link)?.id;
    return mapLink(link, unmap, id === undefined ? undefined : originals.get(unmap(id))) ?? [];
  });

  const next: SubgraphDefinition = {
    ...definition,
    nodes: level.nodes.map((node) => mapNode(node, unmap)),
    links,
  };
  if (Array.isArray(level.groups) && (level.groups.length > 0 || 'groups' in definition)) {
    next.groups = level.groups;
  }
  const inputs = withIoLinks(definition.inputs, links, 'input');
  const outputs = withIoLinks(definition.outputs, links, 'output');
  if (inputs) next.inputs = inputs;
  if (outputs) next.outputs = outputs;

  const written: Workflow = {
    ...base,
    definitions: {
      ...base.definitions,
      subgraphs: definitions.map((other, index) => (index === at ? next : other)),
    },
  };
  const lastNode = Math.max(
    unmap(typeof level.last_node_id === 'number' ? level.last_node_id : 0),
    ...next.nodes.map((node) => node.id),
  );
  const lastLink = Math.max(
    unmap(typeof level.last_link_id === 'number' ? level.last_link_id : 0),
    ...links.map((link) => link.id),
  );
  const counted = withCounters(written, lastNode, lastLink);
  // 中で配ったグループの番号の数えを外へ返す（数えの無い外には足さない）
  return withGroupCounter(counted, lastGroupIdOf(level));
}

/**
 * 階層の中で編集する。`edit` が同じ階層を返したら（何も変わらなければ）同じものを返す。
 * `instanceId` が null なら外をそのまま編集する
 */
export function editLevel(
  workflow: Workflow,
  instanceId: NodeId | null,
  edit: (level: Workflow) => Workflow,
): Workflow {
  if (instanceId === null) return edit(workflow);
  const level = subgraphLevel(workflow, instanceId);
  if (!level) return workflow;
  const next = edit(level);
  return next === level ? workflow : writeSubgraphLevel(workflow, instanceId, next);
}

/**
 * id の並びが 1 つの階層に収まっていれば、その階層（外なら null）。
 * 空・階層をまたぐときは undefined（階層をまたぐ操作は受け付けない）
 */
export function sharedLevel(ids: readonly number[]): NodeId | null | undefined {
  const first = ids[0];
  if (first === undefined) return undefined;
  const level = levelOfId(first);
  return ids.every((id) => levelOfId(id) === level) ? level : undefined;
}
