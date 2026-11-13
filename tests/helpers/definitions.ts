import { searchDefinitions, type SearchFilters } from '@/graph/search';
import type { InputDefinition, NodeDefinition, NodeDefinitionMap } from '@/graph/types';

// ─────────────────────────────
// ノード定義（`/object_info` の射影）を、検証で見たい形だけ最小限に作る（実データは fixtures.ts）。
// `InputDefinition` / `NodeDefinition` の形が変わったら**ここだけ**直す。
// ─────────────────────────────

/** widget として描画される入力（widgets_values にスロットを持つもの） */
export function widget(
  name: string,
  type: string,
  config: Readonly<Record<string, unknown>> = {},
): InputDefinition {
  return { name, type, required: true, isWidget: true, options: null, config };
}

/** リンクで受ける入力ソケット */
export function socket(name: string, type: string): InputDefinition {
  return { name, type, required: true, isWidget: false, options: null, config: {} };
}

/** 表示名・カテゴリ・出力を省いた最小のノード定義。要る項目だけ `overrides` で足す */
export function definition(
  name: string,
  inputs: readonly InputDefinition[],
  overrides: Partial<NodeDefinition> = {},
): NodeDefinition {
  return {
    name,
    displayName: name,
    category: '',
    inputs,
    outputs: [],
    module: 'nodes',
    outputNode: false,
    ...overrides,
  };
}

/** `definition()` の並びを `name` 引きのマップにする */
export function definitionMap(...definitions: readonly NodeDefinition[]): NodeDefinitionMap {
  return new Map(definitions.map((entry) => [entry.name, entry]));
}

/** その定義だけを置いた検索で、名前を打たずに絞り込みを掛けたとき候補に残るか */
export function matchesFilters(definition: NodeDefinition, filters: SearchFilters): boolean {
  return searchDefinitions(definitionMap(definition), '', { filters }).length > 0;
}
