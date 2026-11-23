// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchModelJson, fetchModelNotes, hasModelNotesRoute } from '@/comfy/models';
import { listSavedNotes } from '@/comfy/notes';
import { useLoraText } from '@/hooks/flow/use-lora-text';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

vi.mock('@/comfy/models', () => ({
  fetchModelMetadata: vi.fn(),
  fetchModelNotes: vi.fn(),
  fetchModelJson: vi.fn(),
  hasModelNotesRoute: vi.fn(),
}));
vi.mock('@/comfy/notes', () => ({
  listSavedNotes: vi.fn(),
  fetchSavedNotes: vi.fn(),
  saveNotes: vi.fn(),
}));
const notes = vi.mocked(fetchModelNotes);
const json = vi.mocked(fetchModelJson);
const probe = vi.mocked(hasModelNotesRoute);
const list = vi.mocked(listSavedNotes);
const base = 'http://127.0.0.1:8188';

beforeEach(() => {
  notes.mockReset();
  json.mockReset();
  probe.mockReset();
  list.mockReset();
  list.mockResolvedValue(new Set());
  useModelNotesStore.setState({ status: 'idle', baseUrl: '', error: null });
  useSettingsStore.setState({ baseUrl: base, loraCopyFormat: '<lora:[name]:1> [txt]' });
});

describe('[txt]', () => {
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

describe('画像より文字を先にする', () => {
  it('文字を作っている間は新しい画像の枠を渡さず、作り終えたら渡す', async () => {
    probe.mockResolvedValue(true);
    let finish: (text: string) => void = () => undefined;
    notes.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useLoraText());
    const pending = result.current('loras', 'a.safetensors');
    await vi.waitFor(() => expect(notes).toHaveBeenCalled());

    const slots = renderHook(() => usePreviewSlot('a.webp'));
    expect(slots.result.current.granted).toBe(false);

    finish('memo');
    await pending;
    await vi.waitFor(() => expect(slots.result.current.granted).toBe(true));
  });
});

describe('[キー]（同名の JSON）', () => {
  it('JSON を読んでそのキーの値を書式に入れる', async () => {
    probe.mockResolvedValue(true);
    json.mockResolvedValue([{ key: 'activation text', value: 'kisara' }]);
    useSettingsStore.setState({ loraCopyFormat: '<lora:[name]:1> [activation text]' });
    const { result } = renderHook(() => useLoraText());

    await expect(result.current('loras', 'a.safetensors')).resolves.toEqual({
      text: '<lora:a:1> kisara',
    });
  });

  it('拡張が無ければ JSON を読みに行かず、[キー] のまま残す', async () => {
    probe.mockResolvedValue(false);
    useSettingsStore.setState({ loraCopyFormat: '<lora:[name]:1> [activation text]' });
    const { result } = renderHook(() => useLoraText());

    await expect(result.current('loras', 'a.safetensors')).resolves.toEqual({
      text: '<lora:a:1> [activation text]',
    });
    expect(json).not.toHaveBeenCalled();
  });
});
