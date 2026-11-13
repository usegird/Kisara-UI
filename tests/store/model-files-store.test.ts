import { describe, expect, it, vi } from 'vitest';

import type { ModelFile } from '@/graph/model-files';
import { createModelFilesStore } from '@/store/use-model-files-store';

import { modelFile } from '../helpers/model-files';

// ─────────────────────────────
// モデルファイルの一覧。取るのは 1 回だけだが、つながり直したら失敗したものだけ取り直す。
// ─────────────────────────────

const BASE = 'http://127.0.0.1:8188';

describe('つながり直したときの取り直し', () => {
  it('失敗した種別だけ取り直し、取れた種別には触らない', async () => {
    let down = true;
    const fetchFiles = vi.fn((_: string, folder: string): Promise<ModelFile[]> =>
      down && folder === 'loras'
        ? Promise.reject(new Error('down'))
        : Promise.resolve([modelFile(`${folder}.safetensors`)]),
    );
    const store = createModelFilesStore({ fetchFiles });

    await store.getState().ensure(BASE, 'loras');
    await store.getState().ensure(BASE, 'checkpoints');
    expect(store.getState().folders.get('loras')?.status).toBe('error');

    // 1 回だけ取る方針は変えない（ensure では取り直さない）
    down = false;
    await store.getState().ensure(BASE, 'loras');
    expect(store.getState().folders.get('loras')?.status).toBe('error');

    fetchFiles.mockClear();
    await store.getState().retryFailed(BASE);

    expect(fetchFiles.mock.calls.map((call) => call[1])).toEqual(['loras']);
    expect(store.getState().folders.get('loras')?.status).toBe('ready');
  });
});
