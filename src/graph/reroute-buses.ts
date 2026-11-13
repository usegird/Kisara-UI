import { COLUMN_TOLERANCE } from '@/graph/layout-read';
import { linkIndex } from '@/graph/link-read';
import { rectOf, TITLE_HEIGHT, type NodeRect, type OrderLayout } from '@/graph/node-box';
import type { LinkId, NodeId, ResolvedLink, Workflow, WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// 中継する束を探す。列を読み、出力スロットごとに遠い線と、それらが貫通するノードを数える。
// ─────────────────────────────

/** 出力元の列から、これだけ右の列へ入る線を「遠い」とみなす */
const FAR_COLUMNS = 5;
/** 1 つの出力スロットから出る遠い線がこれ以上あるとき、中継の候補にする */
const MIN_FAR_LINKS = 2;
/** 遠い線が合わせて貫通するノード（重複なし）がこれ以上なら中継する */
const MIN_PIERCED_NODES = 3;
/** 線が箱の幅のこの割合以上を横に走れば「貫通」。それ未満（角かすめ・縦の突き抜け）は数えない */
export const PIERCE_COVERAGE = 0.5;
/** スロットの高さの刻み（本体の見た目の近似。入出力口の縦位置を数えるときに使う） */
const SLOT_HEIGHT = 20;
/** 横断率を測るときに箱の幅を分ける数 */
const COVERAGE_STEPS = 50;
/** 刻みの真ん中（口の縦位置・調べる点を刻みの中央に置く） */
const STEP_MIDDLE = 0.5;

/** 左端の差が `COLUMN_TOLERANCE` 以内のノードを同じ列として、ノードごとの列の番号を返す */
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

/** 線の端（箱と、入出力口の縦位置） */
interface End {
  readonly rect: NodeRect;
  readonly y: number;
}

/** 入出力口の縦位置は本体の見た目の近似（見出しの下から `SLOT_HEIGHT` 刻み） */
function endOf(node: WorkflowNode, slot: number, layout: OrderLayout): End {
  const rect = rectOf(node, layout);
  return { rect, y: rect.top + TITLE_HEIGHT + (slot + STEP_MIDDLE) * SLOT_HEIGHT };
}

/**
 * 出力口から入力口へ直線を引いたとき、箱（上下 `margin` 広げた範囲）の中を横に走る割合。
 * 箱が線の横の範囲の外（出力元より左、接続先より右）なら 0
 */
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

/** 出力スロットの鍵（束の単位） */
export function outputKey(originId: NodeId, originSlot: number): string {
  return `${originId}:${originSlot}`;
}

interface FarLink {
  readonly id: LinkId;
  readonly targetId: NodeId;
}

/** 出力スロットから出る遠い線の集まり（まだ中継の条件は見ていない） */
export interface Candidate {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly from: number;
  readonly links: FarLink[];
  readonly pierced: Set<NodeId>;
}

/** 中継する束（1 つの出力スロットから出る遠い線） */
export interface Bus {
  readonly key: string;
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly fromColumn: number;
  readonly toColumn: number;
  /** 中継する線（接続先の列の順、同じ列なら線の id の順） */
  readonly links: readonly FarLink[];
}

/** 出力スロットごとの遠い線と、それらが貫通するノード */
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

/** 中継する対象。列の範囲が短い順（同じなら左から、出力元・スロットの順） */
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

/** 本体の中継点（`extra.reroutes` の 1 つ）。`pos` は中継点の中心 */
export interface Reroute {
  readonly id: number;
  readonly parentId?: number;
  readonly pos: readonly [number, number];
  readonly linkIds: readonly number[];
  readonly [key: string]: unknown;
}

// ─────────────────────────────
// 置いてある束（こちらの中継点を出力スロットごとにまとめたもの）
// ─────────────────────────────

/** こちらが置いた 1 つの束。`head` は出力元の中継点、`members` は head と接続先ごとの中継点 */
export interface OwnBus {
  readonly head: Reroute;
  readonly members: readonly Reroute[];
}

/**
 * こちらの中継点を束にまとめる。出力スロットは head を通る線から読む。
 * 線が読めない・同じスロットに head が 2 つ・親の無い端は、束にならない（置き直しで消える）
 */
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

/** 束の出力元も接続先も動いておらず、遠い線の顔ぶれも同じなら、置いたままにする */
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
