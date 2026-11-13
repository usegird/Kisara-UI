import type { NodeView } from '@/graph/rows';
import { displayGraph } from '@/graph/subgraph-display';
import { cachedNodeViews } from '@/store/kit/node-views-cache';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// カード表示データ（`NodeView`）の**唯一の入口**。
// フロー本体・実行バー・キュー列が同じ配列を見る。使い回しの実体は `store/kit/node-views-cache`。
// ─────────────────────────────

/**
 * カード表示データの並びを返す。開いた subgraph の中のカードも並ぶ（表示用のワークフローから作る）。
 * @param options - 取り方の指定
 * @param options.includeHidden - 切り替えで隠しているノードも含める
 *   （変数の列など、カードを隠しても残すもの）。番号は隠しても変わらない
 */
export function useNodeViews(
  options: { readonly includeHidden?: boolean } = {},
): readonly NodeView[] {
  const workflow = useGraphStore((state) => state.workflow);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const all = options.includeHidden === true;
  const showControlNodes = useSettingsStore((state) => all || state.showControlNodes);
  const showUnlinkedNodes = useSettingsStore((state) => all || state.showUnlinkedNodes);
  const hiddenCandidates = useGraphStore((state) => state.hiddenCandidates);

  return workflow
    ? cachedNodeViews(displayGraph(workflow).workflow, definitions, {
        showControlNodes,
        showUnlinkedNodes,
        hiddenCandidates,
      })
    : [];
}
