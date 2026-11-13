import { FRONTEND_ONLY_TYPES, type NodeDefinition, type NodeDefinitionMap } from '@/graph/types';

// ─────────────────────────────
// `/object_info` に現れないフロントエンド専用ノード（注記）の定義を補う。実行時には送らない（`to-api-prompt.ts`）。
// ─────────────────────────────

// 注記の中身は `widgets_values[0]` の複数行テキスト 1 つ。定義を補えば、カード・編集・高さ・
// アプリ入力がほかのノードと同じ道を通る（メモだけの特別な描き方を持たない）
function noteDefinition(type: string): NodeDefinition {
  return {
    name: type,
    displayName: type,
    category: '',
    module: '',
    inputs: [
      {
        name: 'text',
        type: 'STRING',
        required: true,
        isWidget: true,
        options: null,
        config: { multiline: true },
      },
    ],
    outputs: [],
    outputNode: false,
  };
}

const FRONTEND_DEFINITIONS: NodeDefinitionMap = new Map(
  FRONTEND_ONLY_TYPES.notes.map((type) => [type, noteDefinition(type)]),
);

/** ノードの定義。`/object_info` に無ければフロントエンド専用ノードの定義を引く */
export function definitionOf(
  definitions: NodeDefinitionMap,
  type: string,
): NodeDefinition | undefined {
  return definitions.get(type) ?? FRONTEND_DEFINITIONS.get(type);
}
