import { linkIndex, readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type ResolvedLink,
  type SubgraphIo,
  type Workflow,
  type WorkflowLink,
  type WorkflowLinkObject,
  type WorkflowNode,
} from '@/graph/types';

// ─────────────────────────────
// グループと subgraph の変換が使う、線の読み分けと付け直し・入口と出口のまとめ。
// ─────────────────────────────

/** 受け手が実際に指している線と、元の形のままの線 */
export interface LiveLink {
  readonly link: ResolvedLink;
  readonly raw: WorkflowLink;
}

/** グループの中と外にまたがる線の読み分け */
interface SplitLinks {
  /** 中どうし */
  readonly internal: LiveLink[];
  /** 外から中へ */
  readonly incoming: LiveLink[];
  /** 中から外へ */
  readonly outgoing: LiveLink[];
}

/** 入口・出口 1 つぶん（出どころが同じ線をまとめたもの） */
export interface Port {
  readonly key: string;
  readonly name: string;
  readonly label: string | undefined;
  readonly type: unknown;
  readonly links: LiveLink[];
}

/** 線の型（元の形のまま。配列の線は 6 番目、キー付きの線は `type`） */
export function rawType(link: WorkflowLink): unknown {
  return Array.isArray(link) ? link[5] : link.type;
}

/** 受け手の入力が実際に指している線だけ（`links[]` に古い線が残っていることがある） */
export function liveLinks(workflow: Workflow): LiveLink[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  return workflow.links.flatMap((raw) => {
    const link = readLink(raw);
    if (!link) return [];
    const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
    return input?.link === link.id ? [{ link, raw }] : [];
  });
}

/** 線を、中どうし・外から中・中から外に分ける（外どうしは入れない） */
export function splitLinks(live: readonly LiveLink[], members: ReadonlySet<NodeId>): SplitLinks {
  const inside = (id: NodeId): boolean => members.has(id);
  return {
    internal: live.filter(({ link }) => inside(link.originId) && inside(link.targetId)),
    incoming: live.filter(({ link }) => !inside(link.originId) && inside(link.targetId)),
    outgoing: live.filter(({ link }) => inside(link.originId) && !inside(link.targetId)),
  };
}

/** 外とまたがる線を入口と出口にまとめる。名前は受け手の入力・出どころの出力から取る */
export function boundaryPorts(
  workflow: Workflow,
  split: SplitLinks,
): { readonly inputs: Port[]; readonly outputs: Port[] } {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const inputs = portsOf(split.incoming, (link) => {
    const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
    return { name: input?.name ?? link.type, label: input?.label };
  });
  const outputs = portsOf(split.outgoing, (link) => {
    const output = nodeOutputs(byId.get(link.originId))[link.originSlot];
    return { name: output?.name ?? link.type, label: undefined };
  });
  return { inputs, outputs };
}

/** 定義の中の線: 中どうし・入口から出る線（id はそのまま）・出口へ入る線（出どころごとに 1 本） */
export function innerLinksOf(
  internal: readonly LiveLink[],
  inputs: readonly Port[],
  outputs: readonly Port[],
): WorkflowLinkObject[] {
  return [
    ...internal.map(({ link, raw }) => objectLink(link, raw, {})),
    ...inputs.flatMap((port, slot) =>
      port.links.map(({ link, raw }) =>
        objectLink(link, raw, { origin_id: SUBGRAPH_IO_NODE_ID.input, origin_slot: slot }),
      ),
    ),
    ...outputs.flatMap((port, slot) => {
      const first = port.links[0];
      return first
        ? [
            objectLink(first.link, first.raw, {
              target_id: SUBGRAPH_IO_NODE_ID.output,
              target_slot: slot,
            }),
          ]
        : [];
    }),
  ];
}

/**
 * ノードの入出力の線の参照を、線の一覧に合わせて付け直す。`ids` のノードだけを触る。
 * 入力は受けている線、出力はそこから出る線（並びは元の順を保ち、足したものは後ろ）
 */
export function relink(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  ids: ReadonlySet<NodeId>,
): WorkflowNode[] {
  const resolved = [...linkIndex(links).values()];
  return nodes.map((node) => {
    if (!ids.has(node.id)) return node;
    const next: WorkflowNode = { ...node };
    if (Array.isArray(node.inputs)) {
      next.inputs = nodeInputs(node).map((input, slot) => {
        const link = resolved.find((l) => l.targetId === node.id && l.targetSlot === slot);
        return { ...input, link: link ? link.id : null };
      });
    }
    if (Array.isArray(node.outputs)) {
      next.outputs = nodeOutputs(node).map((output, slot) => {
        const ids = resolved
          .filter((l) => l.originId === node.id && l.originSlot === slot)
          .map((l) => l.id);
        const kept = (output.links ?? []).filter((id) => ids.includes(id));
        return { ...output, links: [...kept, ...ids.filter((id) => !kept.includes(id))] };
      });
    }
    return next;
  });
}

/** 定義の入口・出口 1 つ */
export function ioOf(port: Port, linkIds: readonly LinkId[]): SubgraphIo {
  return {
    id: uuid(),
    name: port.name,
    type: slotTypeName(port.type),
    linkIds: [...linkIds],
    localized_name: port.name,
    ...(port.label === undefined ? {} : { label: port.label }),
  };
}

/** 定義と入口・出口の id（本体と同じ UUID） */
export function uuid(): string {
  return globalThis.crypto.randomUUID();
}

/** 出どころ（ノードと出力口）ごとにまとめる。名前は `nameOf` の最初のもの */
function portsOf(
  links: readonly LiveLink[],
  nameOf: (link: ResolvedLink) => { readonly name: string; readonly label?: string | undefined },
): Port[] {
  const ports: Port[] = [];
  for (const entry of links) {
    const key = `${String(entry.link.originId)}:${String(entry.link.originSlot)}`;
    const port = ports.find((candidate) => candidate.key === key);
    if (port) {
      port.links.push(entry);
      continue;
    }
    const { name, label } = nameOf(entry.link);
    ports.push({
      key,
      name: uniqueName(
        name,
        ports.map((p) => p.name),
      ),
      label,
      type: rawType(entry.raw),
      links: [entry],
    });
  }
  return ports;
}

function objectLink(
  link: ResolvedLink,
  raw: WorkflowLink,
  patch: Partial<WorkflowLinkObject>,
): WorkflowLinkObject {
  return {
    id: link.id,
    origin_id: link.originId,
    origin_slot: link.originSlot,
    target_id: link.targetId,
    target_slot: link.targetSlot,
    type: rawType(raw),
    ...patch,
  };
}

/** 名前が重なれば番号を足す */
function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  let at = 1;
  while (taken.includes(`${name}_${String(at)}`)) at += 1;
  return `${name}_${String(at)}`;
}
