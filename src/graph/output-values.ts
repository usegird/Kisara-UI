import { linkIndex } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { summarizeValues, type ValuePart } from '@/graph/widgets';

// ─────────────────────────────
// 出力スロットに「何が入っているか」の目安を、自分の設定値と上流から引き継いだ値で組み立てる。
// ─────────────────────────────

const ANY_TYPE = '*';

function matchesOutput(inputType: string, outputType: string): boolean {
  return inputType === outputType || inputType === ANY_TYPE || outputType === ANY_TYPE;
}

/** 値は**部品の並び**で返す。1行にするか改行で並べるかは表示側が決める */
export type OutputValueResolver = (nodeId: NodeId, slot: number) => readonly ValuePart[];

/** 1行に詰めるときのつなぎ方（名前は付けない） */
export function joinValues(values: readonly ValuePart[]): string {
  return values.map((part) => part.text).join(', ');
}

/**
 * 出力スロットの値の目安を引く関数を作る。上流を引き継ぐのは、自分の設定値だけだと
 * `ModelSamplingDiscrete` や `RescaleCFG` のような素通し系のノードで「何のモデルか」が消えるため
 * （例: `model.safetensors, v_prediction, 0.6`）。循環は訪問済み集合で止め、
 * 結果はスロット単位で覚える（何度も辿らない）。
 */
export function createOutputValues(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): OutputValueResolver {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const links = linkIndex(workflow.links);
  const cache = new Map<string, readonly ValuePart[]>();

  /** その出力に流れ込む上流の出力（同じ型の入力を辿る） */
  const upstream = (node: WorkflowNode, outputType: string) => {
    for (const input of nodeInputs(node)) {
      if (input.link === null || input.link === undefined) continue;
      if (!matchesOutput(slotTypeName(input.type), outputType)) continue;

      const link = links.get(input.link);
      if (link) return link;
    }
    return null;
  };

  const resolve = (nodeId: NodeId, slot: number, seen: Set<string>): readonly ValuePart[] => {
    const key = `${nodeId}:${slot}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return [];

    seen.add(key);
    const node = byId.get(nodeId);
    if (!node) return [];

    const own = summarizeValues(node, definitions.get(node.type));
    const outputType = slotTypeName(nodeOutputs(node)[slot]?.type ?? ANY_TYPE);
    const source = upstream(node, outputType);

    const inherited = source ? resolve(source.originId, source.originSlot, seen) : [];
    const values = [...inherited, ...own];

    cache.set(key, values);
    return values;
  };

  // 読めないノードの値は「分からない」として空にする。隣のノードまで巻き込まない
  // （読めないノード自身は、そのカードで壊れた印を出す）
  return (nodeId, slot) => {
    try {
      return resolve(nodeId, slot, new Set());
    } catch {
      return [];
    }
  };
}
