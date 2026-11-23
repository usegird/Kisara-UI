import { definitionOf } from '@/graph/frontend-nodes';
import type { NodeRow } from '@/graph/rows';
import type { NodeId } from '@/graph/types';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function useRowEditing(): {
  readonly commitValue: (row: NodeRow, value: unknown) => void;
  readonly resizeText: (row: NodeRow, height: number) => void;
  readonly needOptions: (row: NodeRow) => void;
  readonly addEntrance: (nodeId: NodeId, widgetName: string) => void;
} {
  const setWidgetValue = useGraphStore((state) => state.setWidgetValue);
  const setProxyWidgetValue = useGraphStore((state) => state.setProxyWidgetValue);
  const setOuterWidgetValue = useGraphStore((state) => state.setOuterWidgetValue);
  const setMultilineHeight = useGraphStore((state) => state.setMultilineHeight);
  const definitions = useDefinitionsStore((state) => state.definitions);
  const ensureOptions = useDefinitionsStore((state) => state.ensureOptions);
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const addSubgraphEntrance = useGraphStore((state) => state.addSubgraphEntrance);

  const commitValue = (row: NodeRow, value: unknown): void => {
    const target = row.target;
    if (!target) return;

    if (target.kind === 'node') {
      const definition = definitionOf(definitions, target.classType);
      if (definition) setWidgetValue(target.nodeId, definition, row.widgetName, value);
      return;
    }
    if (target.kind === 'instance') {
      setOuterWidgetValue(target.nodeId, target.slot, value);
      return;
    }

    const innerDefinition = definitions.get(target.innerClassType);
    if (innerDefinition) {
      setProxyWidgetValue(
        {
          subgraphId: target.subgraphId,
          innerNodeId: target.innerNodeId,
          innerDefinition,
          widgetName: row.widgetName,
        },
        value,
      );
    }
  };

  const resizeText = (row: NodeRow, height: number): void => {
    const target = row.target;
    if (target?.kind !== 'node') return;

    const definition = definitionOf(definitions, target.classType);
    if (definition) setMultilineHeight(target.nodeId, definition, height);
  };

  const needOptions = (row: NodeRow): void => {
    const target = row.target;
    if (!target || baseUrl.length === 0) return;

    const className = target.kind === 'node' ? target.classType : target.innerClassType;
    void ensureOptions(baseUrl, className);
  };

  const addEntrance = (nodeId: NodeId, widgetName: string): void =>
    addSubgraphEntrance(nodeId, widgetName, definitions);

  return { commitValue, resizeText, needOptions, addEntrance };
}
