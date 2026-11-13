// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LORA_FOLDER } from '@/graph/model-files';
import { parseStyleTable } from '@/graph/styles';
import { RECONNECT_PAUSE_MS, useComfyConnect } from '@/hooks/comfy/use-comfy-connection';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTaskLogStore } from '@/store/use-task-log-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

import { acceptTerms } from '../helpers/connection';
import { modelFile, modelFolder } from '../helpers/model-files';

// ─────────────────────────────
// つながっている所からの接続し直し。いったん未接続にし、
// 接続ごとに取る一覧を未取得に戻して、初めての接続と同じ手続きを通す。
// ─────────────────────────────

const BASE = 'http://127.0.0.1:8188';
const ORIGINAL = {
  probe: useConnectionStore.getState().probe,
  load: useDefinitionsStore.getState().load,
};

beforeEach(acceptTerms);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useConnectionStore.setState({ ...ORIGINAL, status: 'disconnected', pausing: false });
  useDefinitionsStore.setState({ load: ORIGINAL.load });
  useModelFilesStore.getState().clear();
  useQueueStore.getState().clear();
  useTaskLogStore.getState().clear();
  useSettingsStore.setState({ baseUrl: '' });
});

describe('接続し直し', () => {
  it('未接続にして一覧を未取得に戻し（中身は残す）、少しおいて接続を確かめる', async () => {
    vi.useFakeTimers();
    const probe = vi.fn(() => {
      useConnectionStore.setState({ status: 'connected' });
      return Promise.resolve(true);
    });
    const load = vi.fn(() => Promise.resolve());
    useSettingsStore.setState({ baseUrl: BASE });
    useConnectionStore.setState({ status: 'connected', socketStatus: 'open', probe });
    useDefinitionsStore.setState({ load });
    useModelFilesStore.setState({
      folders: new Map([[LORA_FOLDER, modelFolder([modelFile('a.safetensors')])]]),
    });
    useStylesStore.setState({ status: 'ready', table: parseStyleTable('name,prompt\r\na,b\r\n') });
    useWildcardsStore.setState({ status: 'ready', baseUrl: BASE, names: ['x'] });

    const { result } = renderHook(() => useComfyConnect());
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.connect();
    });

    expect(useConnectionStore.getState().status).toBe('disconnected');
    expect(result.current.busy).toBe(true);
    const lora = useModelFilesStore.getState().folders.get(LORA_FOLDER);
    expect(lora?.status).toBe('idle');
    expect(lora?.files).toHaveLength(1);
    expect(useStylesStore.getState().status).toBe('idle');
    expect(useWildcardsStore.getState().status).toBe('idle');
    expect(useWildcardsStore.getState().names).toEqual(['x']);
    expect(probe).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_PAUSE_MS);
      await done;
    });
    expect(probe).toHaveBeenCalledWith(BASE);
    expect(load).toHaveBeenCalledWith(BASE);
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('渡した接続先は、未接続にしてから入れ、その接続先で確かめる', async () => {
    vi.useFakeTimers();
    const probe = vi.fn(() => Promise.resolve(false));
    useSettingsStore.setState({ baseUrl: BASE });
    useConnectionStore.setState({ status: 'connected', socketStatus: 'open', probe });
    // 接続先が変わった瞬間の接続の状態。つながったままだと通知の張り直しが不正な URL で投げる
    const seen: string[] = [];
    const stop = useSettingsStore.subscribe((state, prev) => {
      if (state.baseUrl !== prev.baseUrl) seen.push(useConnectionStore.getState().status);
    });

    const { result } = renderHook(() => useComfyConnect());
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.connect('http://localhost:5173x');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_PAUSE_MS);
      await done;
    });
    stop();

    expect(seen).toEqual(['disconnected']);
    expect(useSettingsStore.getState().baseUrl).toBe('http://localhost:5173x');
    expect(probe).toHaveBeenCalledWith('http://localhost:5173x');
  });
});

describe('接続先の切り替え', () => {
  const TASK = {
    promptId: 'p1',
    number: 1,
    startedAt: 1,
    finishedAt: 2,
    success: true,
    outputs: [],
    name: null,
  };

  function remember(): void {
    useQueueStore.setState({ fetchedAt: 1 });
    useTaskLogStore.setState({ entries: [TASK] });
  }

  async function connectTo(url: string): Promise<void> {
    useConnectionStore.setState({ probe: vi.fn(() => Promise.resolve(false)) });
    const { result } = renderHook(() => useComfyConnect());
    await act(() => result.current.connect(url));
  }

  it('別の ComfyUI へ替えたら、前の接続先のキューとタスクの控えを捨てる', async () => {
    useSettingsStore.setState({ baseUrl: BASE });
    remember();

    await connectTo('http://192.168.0.5:8188');

    expect(useQueueStore.getState().fetchedAt).toBeNull();
    expect(useTaskLogStore.getState().entries).toEqual([]);
  });

  it('同じ相手の書き方の違い（スキーム・末尾の / ・パス）では捨てない', async () => {
    useSettingsStore.setState({ baseUrl: BASE });
    remember();

    await connectTo('https://127.0.0.1:8188/comfy/');

    expect(useQueueStore.getState().fetchedAt).toBe(1);
    expect(useTaskLogStore.getState().entries).toHaveLength(1);
  });
});
