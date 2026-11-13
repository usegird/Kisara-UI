import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { fetchPromptFromImage } from '@/comfy/queue';

import { png, pngWithPrompt } from '../helpers/png';

// ─────────────────────────────
// 生成画像に埋まっている API Prompt（PNG の `tEXt(prompt)`）。
// ComfyUI の履歴はメモリ上にあり再起動で消えるので、消えたときの拠り所にする。
// ─────────────────────────────

const file = { filename: 'a.png', subfolder: '', type: 'output' };

describe('画像からの API Prompt 読み取り', () => {
  it('埋め込まれた prompt を返す', async () => {
    const json = '{"9":{"class_type":"KSampler","inputs":{"seed":999}}}';
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response(pngWithPrompt(json))));

    const nodes = await fetchPromptFromImage('http://x', file, { fetchImpl });

    expect(nodes).toEqual({ '9': { class_type: 'KSampler', inputs: { seed: 999 } } });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://x/view?filename=a.png&type=output&subfolder=',
    );
  });

  it('埋め込みが無ければ null', async () => {
    const empty = png();
    const fetchImpl: FetchLike = () => Promise.resolve(new Response(empty));

    await expect(fetchPromptFromImage('http://x', file, { fetchImpl })).resolves.toBeNull();
  });

  it('壊れた JSON でも落ちない', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(new Response(pngWithPrompt('{broken')));

    await expect(fetchPromptFromImage('http://x', file, { fetchImpl })).resolves.toBeNull();
  });
});
