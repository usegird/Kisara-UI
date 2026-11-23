import { useEffect } from 'react';

import { isTextOrDialogTarget } from '@/hooks/flow/use-card-clipboard';
import { historyKeyOf } from '@/lib/text-entry';
import { useGraphStore } from '@/store/use-graph-store';

const APP_INPUT_COLUMN = '[data-app-input-column]';

function insideAppInputs(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(APP_INPUT_COLUMN) !== null;
}

export function useCardShortcuts(deleteSelected: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isTextOrDialogTarget(event.target)) return;

      const history = historyKeyOf(event);
      if (history !== null) {
        if (insideAppInputs(event.target)) return;
        const graph = useGraphStore.getState();
        if (history === 'undo' ? graph.undo() : graph.redo()) event.preventDefault();
        return;
      }

      const plain = !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
      if (event.key !== 'Delete' || !plain) return;
      if (useGraphStore.getState().selectedNodeIds.length === 0) return;
      event.preventDefault();
      deleteSelected();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected]);
}
