import type { NodeView } from '@/graph/rows';
import { displayGraph } from '@/graph/subgraph-display';
import { cachedNodeViews } from '@/store/kit/node-views-cache';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

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
