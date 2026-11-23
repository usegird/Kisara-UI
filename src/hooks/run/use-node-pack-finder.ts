import { cnrIdOf, type MissingNodeType, type NodePackCandidate } from '@/graph/node-packs';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useNodePacksStore } from '@/store/use-node-packs-store';
import { useSettingsStore } from '@/store/use-settings-store';

export interface NodePackFinder {
  readonly missing: readonly MissingNodeType[];
  readonly find: () => void;
  readonly install: (pack: NodePackCandidate) => void;
  readonly restart: () => void;
  readonly refreshDefinitions: () => void;
}

export function useNodePackFinder(): NodePackFinder {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const loaded = useDefinitionsStore((state) => state.definitions.size > 0);
  const refresh = useDefinitionsStore((state) => state.refresh);
  const nodes = useGraphStore((state) => state.workflow?.nodes);
  const views = useNodeViews({ includeHidden: true });
  const findPacks = useNodePacksStore((state) => state.find);
  const installPack = useNodePacksStore((state) => state.install);
  const restartComfy = useNodePacksStore((state) => state.restart);

  const seen = new Set<string>();
  const missing: MissingNodeType[] = [];
  if (loaded) {
    for (const view of views) {
      if (view.kind !== 'unknown' || !view.linked || seen.has(view.classType)) continue;
      seen.add(view.classType);
      const node = nodes?.find((candidate) => candidate.id === view.id);
      missing.push({ classType: view.classType, cnrId: cnrIdOf(node) });
    }
  }

  return {
    missing,
    find: () => void findPacks(baseUrl, missing),
    install: (pack) => void installPack(baseUrl, pack),
    restart: () => void restartComfy(baseUrl),
    refreshDefinitions: () => void refresh(baseUrl),
  };
}
