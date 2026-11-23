import { useDndMonitor } from '@dnd-kit/core';
import { useState } from 'react';

import { droppedGroups, parseAppInputDragId, type AppInputGroup } from '@/graph/app-input-order';

type AppDrag = { readonly active: string; readonly over: string | null } | null;

export function useAppDrag(): AppDrag {
  const [drag, setDrag] = useState<AppDrag>(null);
  const clear = (): void => setDrag(null);
  useDndMonitor({
    onDragStart: ({ active }) => {
      if (parseAppInputDragId(active.id) !== null)
        setDrag({ active: String(active.id), over: null });
    },
    onDragOver: ({ active, over }) => {
      if (parseAppInputDragId(active.id) === null) return;
      const overId = over ? String(over.id) : null;
      setDrag((prev) =>
        prev?.active === String(active.id) && prev.over === overId
          ? prev
          : { active: String(active.id), over: overId },
      );
    },
    onDragEnd: clear,
    onDragCancel: clear,
  });
  return drag;
}

export function shownGroups(
  groups: readonly AppInputGroup[],
  drag: AppDrag,
): readonly AppInputGroup[] {
  const from = parseAppInputDragId(drag?.active);
  const to = parseAppInputDragId(drag?.over);
  return from && to ? droppedGroups(groups, from, to) : groups;
}
