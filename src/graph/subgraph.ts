import { subgraphDefinitions } from '@/graph/normalize';
import type {
  NodeDefinition,
  NodeId,
  SubgraphDefinition,
  SubgraphIo,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { writeWidgetByName } from '@/graph/widgets';
import { isUnknownArray } from '@/lib/guards';

// ─────────────────────────────
// subgraph インスタンスの扱い（定義の引き当て・昇格した widget の読み書き）。昇格した widget の値の
// 実体は内部ノードの widgets_values にある。
// ─────────────────────────────

/** subgraph の定義を id で引ける表 */
export function subgraphMap(workflow: Workflow): Map<string, SubgraphDefinition> {
  const map = new Map<string, SubgraphDefinition>();
  for (const definition of subgraphDefinitions(workflow)) {
    if (typeof definition.id === 'string') map.set(definition.id, definition);
  }
  return map;
}

/** 内部ノードの widget を昇格した参照。properties.proxyWidgets は [id, widget名] の配列 */
interface ProxyWidgetRef {
  readonly nodeId: NodeId;
  readonly widget: string;
}

/** インスタンスの昇格した widget の参照。読めない項目は落とす */
export function proxyWidgets(node: WorkflowNode): ProxyWidgetRef[] {
  const raw: unknown = node.properties?.proxyWidgets;
  if (!isUnknownArray(raw)) return [];

  const refs: ProxyWidgetRef[] = [];
  for (const entry of raw) {
    if (!isUnknownArray(entry) || entry.length < 2) continue;

    const rawId = entry[0];
    const rawWidget = entry[1];
    const nodeId = typeof rawId === 'string' ? Number(rawId) : rawId;
    if (typeof nodeId !== 'number' || Number.isNaN(nodeId)) continue;
    if (typeof rawWidget !== 'string') continue;

    refs.push({ nodeId, widget: rawWidget });
  }
  return refs;
}

/** 境界リンクの slot（definition.inputs のインデックス）から入力口を引く */
export function subgraphInputAt(
  definition: SubgraphDefinition,
  slot: number,
): SubgraphIo | undefined {
  return (definition.inputs ?? [])[slot];
}

/** 昇格 widget の値の実体（subgraph 定義の中のノードの widget） */
export interface SubgraphWidgetRef {
  readonly subgraphId: string;
  readonly innerNodeId: NodeId;
  readonly innerDefinition: NodeDefinition;
  readonly widgetName: string;
}

/**
 * 昇格 widget の値は内部ノードにあるので、subgraph 定義の中のノードを書き換える。
 * 定義以外（ルートの nodes / links）には触れないのでラウンドトリップは保たれる。
 */
export function writeSubgraphWidget(
  workflow: Workflow,
  { subgraphId, innerNodeId, innerDefinition, widgetName }: SubgraphWidgetRef,
  value: unknown,
): Workflow | null {
  const subgraphs = subgraphDefinitions(workflow);
  const targetIndex = subgraphs.findIndex((definition) => definition.id === subgraphId);
  if (targetIndex < 0) return null;

  const target = subgraphs[targetIndex];
  if (!target) return null;

  const innerIndex = target.nodes.findIndex((node) => node.id === innerNodeId);
  const inner = target.nodes[innerIndex];
  if (!inner) return null;

  const updated = writeWidgetByName(inner, innerDefinition, widgetName, value);
  if (!updated) return null;

  const nextNodes = [...target.nodes];
  nextNodes[innerIndex] = updated;

  const nextSubgraphs = [...subgraphs];
  nextSubgraphs[targetIndex] = { ...target, nodes: nextNodes };

  return {
    ...workflow,
    definitions: { ...workflow.definitions, subgraphs: nextSubgraphs },
  };
}
