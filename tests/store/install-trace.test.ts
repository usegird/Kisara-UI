import { afterEach, describe, expect, it } from 'vitest';

import { clearTrace, DEFAULT_TRACE_LEVELS, traceSnapshot } from '@/lib/trace';
import { installTrace } from '@/store/install/install-trace';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 画面の出来事は分けず、そのときのタブの分野に入れる
// ─────────────────────────────

afterEach(() => {
  useSettingsStore.setState({ traceLevels: DEFAULT_TRACE_LEVELS });
  clearTrace();
});

describe('installTrace', () => {
  it('会話のタブへの切り替えは LLM の分野の段階で残す', () => {
    const before = useTabsStore.getState();
    const uninstall = installTrace();
    useSettingsStore.setState({ traceLevels: { comfy: 'error', llm: 'info' } });
    useTabsStore.setState({
      tabs: [...before.tabs, { id: 'trace-chat', kind: 'chat', chatId: 'c1' }],
      activeId: 'trace-chat',
    });
    uninstall();
    useTabsStore.setState({ tabs: before.tabs, activeId: before.activeId });

    const events = traceSnapshot().events;
    expect(events.map((event) => [event.area, event.kind, event.detail?.kind])).toEqual([
      ['llm', 'tab.switch', 'chat'],
    ]);
  });
});
