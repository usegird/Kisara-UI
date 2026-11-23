import { useLayoutEffect, useRef } from 'react';

import { appInputGroups, appInputOrder, type AppInputGroup } from '@/graph/app-input-order';
import {
  appInputHeights,
  appInputSpanKey,
  appInputSpans,
  toggleAppInput as toggleAppInputIn,
} from '@/graph/app-inputs';
import type { NodeView } from '@/graph/rows';
import type { NodeId, Workflow } from '@/graph/types';
import { useItemMotion, type ItemMotion } from '@/hooks/flow/use-flow-motion';
import { useStableContent } from '@/hooks/ui/use-stable-content';
import { sameEntries } from '@/lib/reuse-equal';
import { useGraphStore } from '@/store/use-graph-store';

export interface AppInputColumn {
  readonly groups: readonly AppInputGroup[];
  readonly spans: ReturnType<typeof appInputSpans>;
  readonly heights: ReturnType<typeof appInputHeights>;
  readonly groupMotion: ItemMotion<string>;
  readonly fieldMotion: ItemMotion<string>;
  readonly toggle: (nodeId: NodeId, widgetName: string) => void;
  readonly removeGroup: (group: AppInputGroup) => void;
}

export function useAppInputColumn(
  workflow: Workflow | null,
  views: readonly NodeView[],
  remeasure: () => void,
): AppInputColumn {
  const toggleAppInput = useGraphStore((state) => state.toggleAppInput);
  const removeAppInputs = useGraphStore((state) => state.removeAppInputs);

  const groupMotion = useItemMotion<string>(remeasure);
  const fieldMotion = useItemMotion<string>(remeasure);

  const order = workflow ? appInputOrder(workflow) : [];
  const groups = useStableContent(appInputGroups(views, order));
  const spans = useStableContent(
    workflow ? appInputSpans(workflow) : new Map<string, number>(),
    sameEntries,
  );
  const heights = useStableContent(
    workflow ? appInputHeights(workflow) : new Map<string, number>(),
    sameEntries,
  );

  const latest = useRef({ workflow, views, groups });
  useLayoutEffect(() => {
    latest.current = { workflow, views, groups };
  });
  const { enter: enterGroup, leave: leaveGroup } = groupMotion;
  const { enter: enterField, leave: leaveField } = fieldMotion;
  const toggle = (nodeId: NodeId, widgetName: string): void => {
    const { workflow, views, groups } = latest.current;
    const fieldKey = appInputSpanKey(nodeId, widgetName);
    const holds = (group: AppInputGroup): boolean =>
      group.nodeId === nodeId && group.rows.some((row) => row.widgetName === widgetName);
    const group = groups.find(holds);

    if (group !== undefined) {
      const remove = (): void => toggleAppInput(nodeId, widgetName);
      if (group.rows.length === 1) leaveGroup(group.key, remove);
      else leaveField(fieldKey, remove);
      return;
    }

    const next = workflow ? appInputOrder(toggleAppInputIn(workflow, nodeId, widgetName)) : [];
    const joined = appInputGroups(views, next).find(holds);
    toggleAppInput(nodeId, widgetName);
    if (joined === undefined) return;
    if (joined.rows.length === 1) enterGroup(joined.key);
    else enterField(fieldKey);
  };

  const removeGroup = (group: AppInputGroup): void =>
    leaveGroup(group.key, () =>
      removeAppInputs(
        group.rows.map((row) => ({ nodeId: group.nodeId, widgetName: row.widgetName })),
      ),
    );

  return { groups, spans, heights, groupMotion, fieldMotion, toggle, removeGroup };
}
