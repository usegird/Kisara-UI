import {
  setTraceLevels,
  TRACE_AREAS,
  traceEnabled,
  traceEvent,
  type TraceArea,
  type TraceLevels,
} from '@/lib/trace';
import { useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore, type TabKind } from '@/store/use-tabs-store';

type LongTaskObserver = Pick<PerformanceObserver, 'observe' | 'disconnect'>;

function areaOfKind(kind: TabKind | undefined): TraceArea {
  return kind === 'chat' ? 'llm' : 'comfy';
}

function activeArea(): TraceArea {
  const { tabs, activeId } = useTabsStore.getState();
  return areaOfKind(tabs.find((tab) => tab.id === activeId)?.kind);
}

function observeLongTasks(): LongTaskObserver | null {
  const supported =
    typeof PerformanceObserver === 'function' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask');
  if (!supported) return null;
  const observer = new PerformanceObserver((list) => {
    const area = activeArea();
    for (const entry of list.getEntries()) {
      traceEvent(area, 'debug', 'longtask', () => ({ ms: Math.round(entry.duration) }));
    }
  });
  observer.observe({ type: 'longtask', buffered: false });
  return observer;
}

export function installTrace(): () => void {
  let longTasks: LongTaskObserver | null = null;

  const apply = (levels: TraceLevels): void => {
    setTraceLevels(levels);
    const watch = TRACE_AREAS.some((area) => traceEnabled(area, 'debug'));
    if (watch && longTasks === null) longTasks = observeLongTasks();
    if (!watch && longTasks !== null) {
      longTasks.disconnect();
      longTasks = null;
    }
  };

  apply(useSettingsStore.getState().traceLevels);
  const offSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.traceLevels !== previous.traceLevels) apply(state.traceLevels);
  });

  const offTabs = useTabsStore.subscribe((state, previous) => {
    if (state.activeId === previous.activeId) return;
    const kind = state.tabs.find((tab) => tab.id === state.activeId)?.kind;
    traceEvent(areaOfKind(kind), 'info', 'tab.switch', () => ({ kind: kind ?? null }));
  });

  const offDialogs = useDialogStore.subscribe((state, previous) => {
    if (state.order === previous.order) return;
    const area = activeArea();
    if (!traceEnabled(area, 'debug')) return;
    const before = new Set(previous.order.map((dialog) => dialog.id));
    const after = new Set(state.order.map((dialog) => dialog.id));
    for (const id of after) {
      if (!before.has(id)) traceEvent(area, 'debug', 'dialog.open', () => ({ id }));
    }
    for (const id of before) {
      if (!after.has(id)) traceEvent(area, 'debug', 'dialog.close', () => ({ id }));
    }
  });

  return () => {
    offSettings();
    offTabs();
    offDialogs();
    longTasks?.disconnect();
    longTasks = null;
  };
}
