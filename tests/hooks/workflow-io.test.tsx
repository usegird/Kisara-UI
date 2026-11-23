// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { node } from '../helpers/workflow';

afterEach(() => {
  cleanup();
  useGraphStore.getState().clear();
});

describe('ワークフローの出し入れ', () => {
  it('ワークフローを書き換えても描き直さない（書き出すときに今の中身を読む）', () => {
    useGraphStore.getState().loadWorkflow({ nodes: [node(1, 'Step')], links: [] });
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useWorkflowIo();
    });
    const before = renders;

    act(() => useGraphStore.getState().select(1));
    act(() => useGraphStore.getState().setTitle(1, 'renamed'));

    expect(renders).toBe(before);
  });
});

describe('保存されたワークフローを開く', () => {
  let real: ReturnType<typeof comfyPort>;
  const saved = { name: 'cat', path: 'cat.json', modified: 0, size: 1 };
  const fetchWorkflow = vi.fn(() =>
    Promise.resolve<unknown>({ nodes: [node(1, 'Step')], links: [] }),
  );

  beforeEach(() => {
    fetchWorkflow.mockClear();
    real = comfyPort();
    installComfyPort({ ...real, workflows: { ...real.workflows, fetch: fetchWorkflow } });
    useSettingsStore.setState({ baseUrl: 'http://comfy' });
    useTabsStore.getState().addTab();
  });

  afterEach(() => installComfyPort(real));

  function open(here: boolean): Promise<void> {
    const { result } = renderHook(() => useWorkflowIo());
    return act(() => result.current.openFromServer(saved, { here }));
  }

  it('行は今のタブの中身を替え、別のタブはタブを足す', async () => {
    useGraphStore.getState().loadWorkflow({ nodes: [node(2, 'Other')], links: [] });
    const tabs = useTabsStore.getState().tabs.length;
    await open(true);
    expect(useTabsStore.getState().tabs).toHaveLength(tabs);
    expect(useGraphStore.getState().savedPath).toBe('cat.json');

    useGraphStore.getState().loadWorkflow({ nodes: [node(2, 'Other')], links: [] });
    await open(false);
    expect(useTabsStore.getState().tabs).toHaveLength(tabs + 1);
  });

  it('直しかけのタブは、取りに行く前に確かめ、認めたら新しいタブを足さずに替える', async () => {
    useGraphStore.getState().loadWorkflow({ nodes: [node(2, 'Other')], links: [] });
    useGraphStore.getState().setTitle(2, 'edited');
    const tabs = useTabsStore.getState().tabs.length;
    const { result } = renderHook(() => useWorkflowIo());
    await act(() => result.current.openFromServer(saved, { here: true }));
    expect(result.current.pendingSwitch).toBe(saved);
    expect(fetchWorkflow).not.toHaveBeenCalled();

    act(() => result.current.cancelSwitch());
    expect(result.current.pendingSwitch).toBeNull();
    expect(useGraphStore.getState().dirty).toBe(true);

    await act(() => result.current.openFromServer(saved, { here: true }));
    act(() => result.current.confirmSwitch());
    await vi.waitFor(() => expect(useGraphStore.getState().savedPath).toBe('cat.json'));
    expect(useTabsStore.getState().tabs).toHaveLength(tabs);
    expect(useGraphStore.getState().dirty).toBe(false);
  });

  it('別のタブで開くときは、直しかけでも確かめずにタブを足す', async () => {
    useGraphStore.getState().loadWorkflow({ nodes: [node(2, 'Other')], links: [] });
    useGraphStore.getState().setTitle(2, 'edited');
    const tabs = useTabsStore.getState().tabs.length;
    await open(false);
    expect(useTabsStore.getState().tabs).toHaveLength(tabs + 1);
  });

  it('行は、同じ接続先の同じファイルを開いているタブがあれば、取りに行かずにそこへ移る', async () => {
    await open(true);
    const first = useTabsStore.getState().activeId;
    useTabsStore.getState().addTab();
    await open(true);
    expect(useTabsStore.getState().activeId).toBe(first);
    expect(fetchWorkflow).toHaveBeenCalledTimes(1);
  });

  it('別のタブでは、同じファイルを開いているタブがあってももう 1 つ開く', async () => {
    await open(true);
    const first = useTabsStore.getState().activeId;
    const tabs = useTabsStore.getState().tabs.length;
    await open(false);
    expect(useTabsStore.getState().tabs).toHaveLength(tabs + 1);
    expect(useTabsStore.getState().activeId).not.toBe(first);
    expect(useGraphStore.getState().savedPath).toBe('cat.json');
    expect(fetchWorkflow).toHaveBeenCalledTimes(2);
  });
});
