import { useEffect, useRef } from 'react';

import type { NodeId } from '@/graph/types';
import { isTextEntry } from '@/lib/text-entry';
import { useGraphStore } from '@/store/use-graph-store';
import { useTabsStore } from '@/store/use-tabs-store';

const DIALOG = '[role="dialog"],[role="alertdialog"],[data-dialog-window]';

export function isTextOrDialogTarget(target: EventTarget | null): boolean {
  return isTextEntry(target) || (target instanceof Element && target.closest(DIALOG) !== null);
}

function hasTextSelection(): boolean {
  const selection = globalThis.getSelection();
  return selection !== null && !selection.isCollapsed;
}

export function useCardClipboard(
  paste: (sources: readonly NodeId[], after: readonly NodeId[]) => void,
): void {
  const copied = useRef<{ readonly tab: string; readonly nodeIds: readonly NodeId[] } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (
        (key !== 'c' && key !== 'v') ||
        event.defaultPrevented ||
        isTextOrDialogTarget(event.target)
      ) {
        return;
      }
      const tab = useTabsStore.getState().activeId;
      const selected = useGraphStore.getState().selectedNodeIds;

      if (key === 'c') {
        if (selected.length === 0 || hasTextSelection()) return;
        copied.current = { tab, nodeIds: selected };
        event.preventDefault();
        return;
      }
      const source = copied.current;
      if (source === null || source.tab !== tab) return;
      event.preventDefault();
      paste(source.nodeIds, selected.length > 0 ? selected : source.nodeIds);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [paste]);
}
