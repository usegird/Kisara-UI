import {
  groupIndexOf,
  groupLabelAt,
  groupMembership,
  groupNodeIds,
  groupParents,
  workflowGroups,
} from '@/graph/groups';
import { orderedNodeIds } from '@/graph/layout-read';
import { ownData, writeOwnData } from '@/graph/own-data';
import { NODE_MODE, nodeMode, type NodeId, type Workflow } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// グループの切り替え。並び（`extra.kisara.switches`）の読み書きと、メンバーをまとめてバイパスする編集。
// ─────────────────────────────

const SWITCHES = 'switches';

/** 切り替えの状態。`mixed` は入りと切りが混ざっている */
export type GroupSwitchState = 'on' | 'off' | 'mixed';

/** アプリ入力の列に出す切り替え 1 つ */
export interface GroupSwitchView {
  readonly groupId: number;
  readonly title: string;
  /** 本体の `color`。無ければ未設定 */
  readonly color?: string | undefined;
  readonly state: GroupSwitchState;
  /** メンバーのノード（子のグループの中も） */
  readonly nodeIds: readonly NodeId[];
}

/** 切り替えに出すグループの `id` の並び。無い・読めない形なら空 */
export function groupSwitchIds(workflow: Workflow): number[] {
  const value = ownData(workflow)?.[SWITCHES];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => Number.isInteger(entry));
}

/** そのグループを切り替えに出しているか */
export function hasGroupSwitch(workflow: Workflow, groupId: number): boolean {
  return groupSwitchIds(workflow).includes(groupId);
}

/** 切り替えに出す・外す */
export function toggleGroupSwitch(workflow: Workflow, groupId: number): Workflow {
  const ids = groupSwitchIds(workflow);
  const next = ids.includes(groupId) ? ids.filter((id) => id !== groupId) : [...ids, groupId];
  return writeOwnData(workflow, SWITCHES, next.length === 0 ? undefined : next);
}

/** 切り替えをまとめて外す。ノードの `mode` は変えない */
export function clearGroupSwitches(workflow: Workflow): Workflow {
  return groupSwitchIds(workflow).length === 0
    ? workflow
    : writeOwnData(workflow, SWITCHES, undefined);
}

/** 鍵のグループを切り替えに出しているか。`id` を持たないグループは出せないので null */
export function groupSwitchShownOf(workflow: Workflow, key: string): boolean | null {
  const groupId = groupIdAt(workflow, groupIndexOf(workflow, key));
  return groupId === null ? null : hasGroupSwitch(workflow, groupId);
}

/** 添字のグループの `id`。持たなければ null（切り替えに出せない） */
export function groupIdAt(workflow: Workflow, index: number): number | null {
  const group = workflowGroups(workflow)[index];
  return isRecord(group) && Number.isInteger(group.id) ? (group.id as number) : null;
}

/**
 * 列に出す切り替え。並びはカードの列のグループの順。指す先が無い・メンバーが居ないものは出さない
 */
export function groupSwitchesOf(workflow: Workflow): GroupSwitchView[] {
  const ids = groupSwitchIds(workflow);
  if (ids.length === 0) return [];

  const order = orderedNodeIds(workflow);
  const membership = groupMembership(workflow);
  const parents = groupParents(workflow);
  const modes = new Map(workflow.nodes.map((node) => [node.id, nodeMode(node)]));
  const views: { readonly view: GroupSwitchView; readonly first: number }[] = [];
  const groups = workflowGroups(workflow);
  for (const groupId of new Set(ids)) {
    const index = groups.findIndex((_, at) => groupIdAt(workflow, at) === groupId);
    if (index < 0) continue;
    const nodeIds = groupNodeIds(order, index, membership, parents);
    const head = nodeIds[0];
    if (head === undefined) continue;
    const { title, color } = groupLabelAt(workflow, index);
    const state = switchStateOf(nodeIds.map((id) => modes.get(id) ?? NODE_MODE.normal));
    views.push({ view: { groupId, title, color, state, nodeIds }, first: order.indexOf(head) });
  }
  return views.sort((a, b) => a.first - b.first).map((entry) => entry.view);
}

/**
 * メンバーをまとめて入れる（通常）・切る（バイパス）。変わらなければ同じものを返す。
 * ミュートは使わない（素通しが無く、下流が入力を失う）
 */
export function setNodesBypassed(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  bypassed: boolean,
): Workflow {
  const targets = new Set(nodeIds);
  const mode = bypassed ? NODE_MODE.bypass : NODE_MODE.normal;
  let changed = false;
  const nodes = workflow.nodes.map((node) => {
    if (!targets.has(node.id) || nodeMode(node) === mode) return node;
    changed = true;
    return { ...node, mode };
  });
  return changed ? { ...workflow, nodes } : workflow;
}

/**
 * 並べた枠のノードのうち、無効（バイパス・ミュート）のもの。並びの順
 */
export function disabledNodeIdsOf(
  workflow: Workflow | null,
  frames: readonly { readonly nodeId: NodeId }[],
): NodeId[] {
  if (!workflow) return [];
  const disabled = new Set(
    workflow.nodes.filter((node) => nodeMode(node) !== NODE_MODE.normal).map((node) => node.id),
  );
  return frames.map((frame) => frame.nodeId).filter((id) => disabled.has(id));
}

function switchStateOf(modes: readonly number[]): GroupSwitchState {
  const off = modes.filter((mode) => mode === NODE_MODE.bypass).length;
  if (off === 0) return 'on';
  return off === modes.length ? 'off' : 'mixed';
}
