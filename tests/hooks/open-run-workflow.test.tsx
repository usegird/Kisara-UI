// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOpenRunWorkflow } from '@/hooks/run/use-open-run-workflow';
import type { HistoryRun } from '@/queue/run-history-view';

// ─────────────────────────────
// 記録の実行を、出力の画像に埋まった Workflow JSON から開く
// ─────────────────────────────

const fetchWorkflowFromImage = vi.hoisted(() => vi.fn());
const openWorkflow = vi.hoisted(() => vi.fn());

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchWorkflowFromImage,
}));
vi.mock('@/store/persist/workflow-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/persist/workflow-file')>()),
  openWorkflow,
}));

afterEach(() => {
  cleanup();
  fetchWorkflowFromImage.mockReset();
  openWorkflow.mockReset();
});

function run(files: readonly string[]): HistoryRun {
  return {
    startedAt: 1,
    finishedAt: 2,
    outputs: files.map((filename) => ({ filename, subfolder: '', type: 'output' })),
    prompt: null,
    seeds: [],
    entry: { model: [], lora: [], other: [], nodes: {}, seeds: [], prompts: [], name: 'portrait' },
    promptValues: [],
  };
}

describe('記録の実行をワークフローとして開く', () => {
  it('PNG を順に読み、埋まったものが見つかったら開いて止める', async () => {
    const workflow = { nodes: [], links: [] };
    fetchWorkflowFromImage
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(workflow)
      .mockResolvedValue(null);
    const { result } = renderHook(() => useOpenRunWorkflow());

    await act(() => result.current.open(run(['a.png', 'b.webp', 'c.png', 'd.png'])));

    expect(fetchWorkflowFromImage).toHaveBeenCalledTimes(2);
    expect(openWorkflow).toHaveBeenCalledWith(workflow, 'portrait');
    expect(result.current.error).toBeNull();
  });

  it('どの画像からも読めなければ理由を出す', async () => {
    fetchWorkflowFromImage.mockResolvedValue(null);
    const { result } = renderHook(() => useOpenRunWorkflow());

    await act(() => result.current.open(run(['a.png'])));

    expect(openWorkflow).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
    expect(result.current.opening).toBe(false);
  });
});
