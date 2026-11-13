// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchModelNotes, hasModelNotesRoute } from '@/comfy/models';
import { listSavedNotes } from '@/comfy/notes';
import { useLoraText } from '@/hooks/flow/use-lora-text';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 写し取りの書式の `[memo]`。読み書きは差し替える（ComfyUI に触れない）。
// ─────────────────────────────

vi.mock('@/comfy/models', () => ({
  fetchModelMetadata: vi.fn(),
  fetchModelNotes: vi.fn(),
  hasModelNotesRoute: vi.fn(),
}));
vi.mock('@/comfy/notes', () => ({
  listSavedNotes: vi.fn(),
  fetchSavedNotes: vi.fn(),
  saveNotes: vi.fn(),
}));
const notes = vi.mocked(fetchModelNotes);
const probe = vi.mocked(hasModelNotesRoute);
const list = vi.mocked(listSavedNotes);
const base = 'http://127.0.0.1:8188';

beforeEach(() => {
  notes.mockReset();
  probe.mockReset();
  list.mockReset();
  list.mockResolvedValue(new Set());
  useModelNotesStore.setState({ status: 'idle', baseUrl: '', error: null });
  useSettingsStore.setState({ baseUrl: base, loraCopyFormat: '<lora:[loraname]:1> [memo]' });
});

describe('[memo]', () => {
  it('メモを読んで書式に入れる', async () => {
    probe.mockResolvedValue(true);
    notes.mockResolvedValue('trigger\n');
    const { result } = renderHook(() => useLoraText());

    await expect(result.current('loras', 'a.safetensors')).resolves.toEqual({
      text: '<lora:a:1> trigger',
    });
  });

  it('kisara/ にも無く拡張も無ければメモを読みに行かず、空にする。有無は 1 回だけ確かめる', async () => {
    probe.mockResolvedValue(false);
    const { result } = renderHook(() => useLoraText());

    await result.current('loras', 'a.safetensors');
    const second = await result.current('loras', 'b.safetensors');

    expect(second).toEqual({ text: '<lora:b:1>' });
    expect(notes).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
