import { createNode } from '@/graph/create-node';
import { buildNodeViews, type NodeView } from '@/graph/rows';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';

// ─────────────────────────────
// ノードの追加の候補を指したときに出すカードの見本。足したときと同じ作り方で組み、ワークフローには入れない。
// ─────────────────────────────

/** 見本のノードの id。ワークフローの id（正の数）と重ねない（測定や受け口の鍵がぶつかるため） */
const PREVIEW_NODE_ID = -1;

/** 定義から作ったカードの見た目。組めなければ null */
export function previewNodeView(
  definition: NodeDefinition,
  definitions: NodeDefinitionMap,
): NodeView | null {
  const node = createNode(definition, PREVIEW_NODE_ID);
  // 1 つだけなので繋がっていない。操作系として隠すものも見本では出す
  const options = { showControlNodes: true, showUnlinkedNodes: true };
  return buildNodeViews({ nodes: [node], links: [] }, definitions, options)[0] ?? null;
}
