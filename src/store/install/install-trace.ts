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

// ─────────────────────────────
// 診断のログの段階を設定から入れ、画面の出来事を見張る。
// 入口から 1 回呼ぶ。見るのは種類だけ（タブの種類・ダイアログの名前・長いタスクの長さ）。
// 画面の出来事は分けず、そのときのタブの分野に入れる（ワークフロー・画像は ComfyUI、会話は LLM）
// ─────────────────────────────

type LongTaskObserver = Pick<PerformanceObserver, 'observe' | 'disconnect'>;

function areaOfKind(kind: TabKind | undefined): TraceArea {
  return kind === 'chat' ? 'llm' : 'comfy';
}

/** 今のタブの分野 */
function activeArea(): TraceArea {
  const { tabs, activeId } = useTabsStore.getState();
  return areaOfKind(tabs.find((tab) => tab.id === activeId)?.kind);
}

/** 長いタスク（long task）を見張る。対応しないブラウザでは何もしない */
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

/** 取り付けて、外す関数を返す（テスト用。アプリでは外さない） */
export function installTrace(): () => void {
  let longTasks: LongTaskObserver | null = null;

  const apply = (levels: TraceLevels): void => {
    setTraceLevels(levels);
    // 長いタスクはどちらかの分野が `debug` の間だけ見張る（見張り自体を普段は置かない）
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
