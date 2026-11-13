// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveWorkflow, WorkflowExistsError, WorkflowNotOwnedError } from '@/comfy/workflows';
import { useWorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { openWorkflow, serializeWorkflow } from '@/store/persist/workflow-file';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { node } from '../helpers/workflow';

// ─────────────────────────────
// ComfyUI への保存。上書きするのは KisaraUI が作ったファイルを今の接続先で開いたときだけ。
// 書く中身は押した時点（同名の確認では確認を出した時点）の控え。書き込みは差し替える。
// ─────────────────────────────

vi.mock('@/comfy/workflows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/workflows')>()),
  saveWorkflow: vi.fn(),
}));
const save = vi.mocked(saveWorkflow);
const BASE = 'http://127.0.0.1:8188';
const OWN = { nodes: [node(1, 'Step')], links: [], extra: { kisara: { created: true } } };
const FOREIGN = { nodes: [node(1, 'Step')], links: [] };

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue();
  useSettingsStore.setState({ baseUrl: BASE });
});
afterEach(() => {
  cleanup();
  useGraphStore.getState().clear();
});

function io() {
  return renderHook(() => useWorkflowIo()).result;
}

describe('作った印', () => {
  it('開いたときに読んで外し、上書きしてよいかを覚える', () => {
    openWorkflow(OWN, 'a', { path: 'a.json', baseUrl: BASE });

    const graph = useGraphStore.getState();
    expect(JSON.stringify(graph.workflow)).not.toContain('created');
    expect({ own: graph.savedOwn, on: graph.savedOn }).toEqual({ own: true, on: BASE });
  });

  it('ComfyUI へ保存するときだけ付け、エクスポートには付けない', () => {
    openWorkflow(FOREIGN, 'a');
    const workflow = useGraphStore.getState().workflow;
    if (workflow === null) throw new Error('not loaded');

    expect(serializeWorkflow(workflow, { created: true })).toContain('"created": true');
    expect(serializeWorkflow(workflow)).not.toContain('created');
  });
});

describe('上書き保存', () => {
  it('KisaraUI が作ったファイルを今の接続先で開いたら、印を付けて上書きする', async () => {
    openWorkflow(OWN, 'a', { path: 'a.json', baseUrl: BASE });
    const result = io();

    await act(() => result.current.save());

    expect(save.mock.calls[0]?.[1]).toBe('a.json');
    expect(save.mock.calls[0]?.[3]).toMatchObject({ overwrite: true });
    expect(save.mock.calls[0]?.[2]).toContain('"created": true');
  });

  it('KisaraUI が作っていないファイルは書かずに、名前を付けて保存を開く', async () => {
    openWorkflow(FOREIGN, 'a', { path: 'a.json', baseUrl: BASE });
    const result = io();

    await act(() => result.current.save());

    expect(save).not.toHaveBeenCalled();
    expect(result.current.saveAsOpen).toBe(true);
  });

  it('保存先を覚えた接続先と今の接続先が違えば、書かずに名前を付けて保存を開く', async () => {
    openWorkflow(OWN, 'a', { path: 'a.json', baseUrl: 'http://other:8188' });
    const result = io();

    await act(() => result.current.save());

    expect(save).not.toHaveBeenCalled();
    expect(result.current.saveAsOpen).toBe(true);
  });

  it('書く直前に KisaraUI の作ったファイルでないと分かったら、以後は上書きしない', async () => {
    openWorkflow(OWN, 'a', { path: 'a.json', baseUrl: BASE });
    save.mockRejectedValueOnce(new WorkflowNotOwnedError('a.json'));
    const result = io();

    await act(() => result.current.save());

    expect(useGraphStore.getState().savedOwn).toBe(false);
    expect(result.current.saveAsOpen).toBe(true);
    expect(result.current.saveState.kind).toBe('error');
  });
});

describe('名前を付けて保存の同名', () => {
  it('KisaraUI が作っていない同名があれば、上書きを確かめずに別の名前を求める', async () => {
    openWorkflow(FOREIGN, 'a');
    save.mockRejectedValueOnce(new WorkflowExistsError('b.json', false));
    const result = io();

    await act(() => result.current.saveAs('b'));

    expect(result.current.saveState.kind).toBe('error');
    expect(result.current.saveAsOpen).toBe(true);
  });

  it('確認で書くのは、確認を出した時点の中身（その後にタブの中身が変わっても）', async () => {
    openWorkflow(FOREIGN, 'a');
    save.mockRejectedValueOnce(new WorkflowExistsError('b.json', true));
    const result = io();
    await act(() => result.current.saveAs('b'));
    expect(result.current.saveState.kind).toBe('exists');

    act(() => useGraphStore.getState().setTitle(1, 'changed after the dialog'));
    await act(() => result.current.confirmOverwrite());

    expect(save.mock.calls[1]?.[3]).toMatchObject({ overwrite: true });
    expect(save.mock.calls[1]?.[2]).toBe(save.mock.calls[0]?.[2]);
    // 書いたのは確認を出した時点の中身なので、後から直した分は未保存のまま
    expect(useGraphStore.getState().dirty).toBe(true);
  });

  it('書いている間に直した分は、保存できても未保存の印を残す', async () => {
    openWorkflow(OWN, 'a', { path: 'a.json', baseUrl: BASE });
    let finish: () => void = () => undefined;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const result = io();

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.save();
    });
    act(() => useGraphStore.getState().setTitle(1, 'changed while saving'));
    await act(async () => {
      finish();
      await saving;
    });
    expect(useGraphStore.getState().dirty).toBe(true);
    expect(useGraphStore.getState().savedPath).toBe('a.json');

    await act(() => result.current.save());
    expect(useGraphStore.getState().dirty).toBe(false);
  });

  it('確認の間に接続先が変わったら書かない', async () => {
    openWorkflow(FOREIGN, 'a');
    save.mockRejectedValueOnce(new WorkflowExistsError('b.json', true));
    const result = io();
    await act(() => result.current.saveAs('b'));

    act(() => {
      useSettingsStore.setState({ baseUrl: 'http://other:8188' });
    });
    await act(() => result.current.confirmOverwrite());

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saveState.kind).toBe('error');
  });
});
