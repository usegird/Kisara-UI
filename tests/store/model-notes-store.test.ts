import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchModelNotes, hasModelNotesRoute } from '@/comfy/models';
import { fetchSavedNotes, listSavedNotes, saveNotes } from '@/comfy/notes';
import { useModelNotesStore } from '@/store/use-model-notes-store';

// ─────────────────────────────
// メモの読み先。`kisara/` の一覧と拡張の有無は接続ごとに 1 回。
// `kisara/` にあればそれを、無ければ pysssss の `.txt` を読む。書くのは `kisara/` だけ。
// ─────────────────────────────

vi.mock('@/comfy/models', () => ({ hasModelNotesRoute: vi.fn(), fetchModelNotes: vi.fn() }));
vi.mock('@/comfy/notes', () => ({
  listSavedNotes: vi.fn(),
  fetchSavedNotes: vi.fn(),
  saveNotes: vi.fn(),
}));
const probe = vi.mocked(hasModelNotesRoute);
const pysssss = vi.mocked(fetchModelNotes);
const list = vi.mocked(listSavedNotes);
const saved = vi.mocked(fetchSavedNotes);
const save = vi.mocked(saveNotes);
const base = 'http://127.0.0.1:8188';

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue(new Set(['loras/a.safetensors.txt']));
  saved.mockResolvedValue('kisara');
  pysssss.mockResolvedValue('pysssss');
  useModelNotesStore.setState({ status: 'idle', baseUrl: '', error: null });
});

describe('確かめる回数', () => {
  it('何度求められても、接続先ごとに 1 回だけ確かめる', async () => {
    probe.mockResolvedValue(false);
    const { ensure } = useModelNotesStore.getState();

    await ensure(base);
    await ensure(base);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(useModelNotesStore.getState().status).toBe('ready');
  });

  it('接続し直すと確かめ直す', async () => {
    probe.mockResolvedValue(true);
    await useModelNotesStore.getState().ensure(base);

    useModelNotesStore.getState().invalidate();
    await useModelNotesStore.getState().ensure(base);

    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe('読み先', () => {
  it('kisara/ にあればそれを読み、pysssss の .txt は読まない', async () => {
    probe.mockResolvedValue(true);
    await useModelNotesStore.getState().ensure(base);

    await expect(useModelNotesStore.getState().read(base, 'loras', 'a.safetensors')).resolves.toBe(
      'kisara',
    );
    expect(pysssss).not.toHaveBeenCalled();
  });

  it('kisara/ のメモが空なら書いていないとみなし、pysssss の .txt を読む', async () => {
    probe.mockResolvedValue(true);
    saved.mockResolvedValue('  \n');
    await useModelNotesStore.getState().ensure(base);
    await expect(useModelNotesStore.getState().read(base, 'loras', 'a.safetensors')).resolves.toBe(
      'pysssss',
    );
  });

  it('kisara/ に無ければ pysssss の .txt を読み、拡張も無ければどちらも読まない', async () => {
    probe.mockResolvedValue(true);
    await useModelNotesStore.getState().ensure(base);
    await expect(useModelNotesStore.getState().read(base, 'loras', 'b.safetensors')).resolves.toBe(
      'pysssss',
    );

    useModelNotesStore.setState({ pysssss: false });
    await expect(
      useModelNotesStore.getState().read(base, 'loras', 'b.safetensors'),
    ).resolves.toBeNull();
    expect(saved).not.toHaveBeenCalled();
  });

  it('拡張が無くても書け、書いた後は kisara/ を読む', async () => {
    probe.mockResolvedValue(false);
    await useModelNotesStore.getState().ensure(base);

    await useModelNotesStore.getState().save(base, 'loras', 'b.safetensors', 'memo');
    await useModelNotesStore.getState().read(base, 'loras', 'b.safetensors');

    expect(save).toHaveBeenCalledWith(
      base,
      { folder: 'loras', filename: 'b.safetensors', text: 'memo' },
      undefined,
    );
    expect(saved).toHaveBeenCalledWith(base, 'loras', 'b.safetensors', undefined);
  });
});
