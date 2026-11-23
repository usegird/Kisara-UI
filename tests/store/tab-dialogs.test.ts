import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emptyStyle } from '@/graph/styles';
import { useGraphStore } from '@/store/use-graph-store';
import { reportStyleDraft, useStylesStore } from '@/store/use-styles-store';
import { useTabUiStore } from '@/store/use-tab-ui-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useViewerStore } from '@/store/use-viewer-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

function resetTabs(): void {
  const { tabs, activeId } = useTabsStore.getState();
  for (const tab of tabs) if (tab.id !== activeId) useTabsStore.getState().closeTab(tab.id);
  useTabsStore.setState({ snapshots: {} });
  useGraphStore.getState().clear();
}

function closeAll(): void {
  useTaskDetailStore.getState().close();
  useViewerStore.getState().close();
  useWildcardsStore.getState().closePanel();
  useStylesStore.getState().closeEditor();
  useTabUiStore.setState({ values: {} });
  reportStyleDraft(null);
}

beforeEach(() => {
  resetTabs();
  closeAll();
});
afterEach(closeAll);

describe('タブごとのダイアログ', () => {
  it('切り替えたら隠し、戻ったら同じ対象で開き直す。新しいタブは何も開いていない', () => {
    const first = useTabsStore.getState().activeId;
    useTaskDetailStore.getState().open('p1');
    useViewerStore.getState().openOverlay('img-3');
    useWildcardsStore.getState().openPanel();
    useTabUiStore.getState().setValue('flow.settingsFor', 7);

    const second = useTabsStore.getState().addTab();
    expect(useTaskDetailStore.getState().promptId).toBeNull();
    expect(useViewerStore.getState().mode).toBe('closed');
    expect(useWildcardsStore.getState().panelOpen).toBe(false);
    expect(useTabUiStore.getState().values).toEqual({});

    useTaskDetailStore.getState().open('p2');

    useTabsStore.getState().selectTab(first);
    expect(useTaskDetailStore.getState().promptId).toBe('p1');
    expect(useViewerStore.getState()).toMatchObject({ mode: 'overlay', current: 'img-3' });
    expect(useWildcardsStore.getState().panelOpen).toBe(true);
    expect(useTabUiStore.getState().values).toEqual({ 'flow.settingsFor': 7 });

    useTabsStore.getState().selectTab(second);
    expect(useTaskDetailStore.getState().promptId).toBe('p2');
    expect(useWildcardsStore.getState().panelOpen).toBe(false);
  });

  it('直しかけのスタイルは、戻ったときに直しかけのまま開く', () => {
    const first = useTabsStore.getState().activeId;
    useStylesStore.getState().openEditor('portrait');
    const draft = { ...emptyStyle(), name: 'portrait', prompt: 'edited' };
    reportStyleDraft(draft);

    useTabsStore.getState().addTab();
    expect(useStylesStore.getState().editing).toBeNull();

    useTabsStore.getState().selectTab(first);
    expect(useStylesStore.getState().editing).toEqual({ name: 'portrait', draft });
  });

  it('別のウィンドウに出したビューワーはタブに付かない', () => {
    const popup = { closed: false } as unknown as Parameters<
      ReturnType<typeof useViewerStore.getState>['openWindow']
    >[0];
    useViewerStore.getState().openWindow(popup, 'img-1');

    useTabsStore.getState().addTab();
    expect(useViewerStore.getState().mode).toBe('window');
  });
});
