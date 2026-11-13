import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '@/comfy/client';
import { modelListUrl, modelMetadataUrl, modelNotesUrl, modelPreviewUrl } from '@/comfy/endpoints';
import {
  fetchModelFiles,
  fetchModelNotes,
  hasModelNotesRoute,
  modelPreviewSrc,
} from '@/comfy/models';
import { parseModelFiles, parseModelMetadata } from '@/comfy/schema';
import { LORA_FOLDER } from '@/graph/model-files';

// ─────────────────────────────
// モデル一覧の取得。持たない接続先があるので、想定外の形でも落ちないこと。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';

describe('一覧の URL とプレビューの URL', () => {
  it('種別ごとの一覧', () => {
    expect(modelListUrl(base, LORA_FOLDER)).toBe(`${base}/experiment/models/loras`);
  });

  it('プレビューは区切りを残し、要素だけ符号化する', () => {
    expect(
      modelPreviewUrl(base, { folder: 'loras', pathIndex: 1, name: 'a b\\c d.safetensors' }),
    ).toBe(`${base}/experiment/models/preview/loras/1/a%20b/c%20d.safetensors`);
  });

  it('埋め込み情報は名前をクエリで渡す', () => {
    expect(modelMetadataUrl(base, 'loras', 'style/a b.safetensors')).toBe(
      `${base}/view_metadata/loras?filename=style%2Fa+b.safetensors`,
    );
  });

  it('一覧に無いものには画像を出せない', () => {
    expect(modelPreviewSrc(base, LORA_FOLDER, null)).toBeNull();
  });
});

describe('一覧の検証', () => {
  it('日時は秒で返るのでミリ秒に直す', () => {
    const files = parseModelFiles([
      { name: 'a.safetensors', pathIndex: 2, modified: 1.5, created: 2, size: 10 },
    ]);

    expect(files[0]).toEqual({
      name: 'a.safetensors',
      pathIndex: 2,
      modified: 1500,
      created: 2000,
      size: 10,
    });
  });

  it('名前が無い項目と配列でない応答は落とす', () => {
    expect(parseModelFiles([{ pathIndex: 0 }, 42, { name: '' }])).toEqual([]);
    expect(parseModelFiles(null)).toEqual([]);
  });

  it('欠けている項目は null と 0 で埋める', () => {
    expect(parseModelFiles([{ name: 'a.safetensors' }])[0]).toEqual({
      name: 'a.safetensors',
      pathIndex: 0,
      modified: null,
      created: null,
      size: null,
    });
  });
});

describe('取得', () => {
  it('種別の一覧を引いて射影する', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        new Response(JSON.stringify([{ name: 'a.safetensors', pathIndex: 0 }]), { status: 200 }),
      );

    const files = await fetchModelFiles(base, LORA_FOLDER, { fetchImpl });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${base}/experiment/models/loras`);
    expect(files.map((file) => file.name)).toEqual(['a.safetensors']);
  });
});

describe('埋め込み情報の検証', () => {
  it('文字列でない値も文字列にして残す', () => {
    const entries = parseModelMetadata({ ss_network_dim: 32, ss_v2: false, bad: { a: 1 } });

    expect([...entries.entries()]).toEqual([
      ['ss_network_dim', '32'],
      ['ss_v2', 'false'],
    ]);
  });

  it('想定外の形は空にする', () => {
    expect(parseModelMetadata(null).size).toBe(0);
    expect(parseModelMetadata([1, 2]).size).toBe(0);
  });
});

describe('同名の .txt（メモ。pysssss の経路。読むだけ）', () => {
  it('読みは拡張子を txt に替え、種別ごと 1 つの要素として符号化する', () => {
    expect(modelNotesUrl(base, 'loras', 'back/a b.safetensors')).toBe(
      `${base}/pysssss/view/loras%2Fback%2Fa%20b.txt`,
    );
  });

  it('無い（404）は失敗ではなく null', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));

    await expect(fetchModelNotes(base, 'loras', 'a.safetensors', { fetchImpl })).resolves.toBe(
      null,
    );
  });

  it('あれば中身をそのまま返す', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('メモ', { status: 200 }));

    await expect(fetchModelNotes(base, 'loras', 'a.safetensors', { fetchImpl })).resolves.toBe(
      'メモ',
    );
  });
});

describe('メモの拡張の有無', () => {
  it('経路が無ければ（404）false、あれば true', async () => {
    const missing = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status: 404 }));
    const present = vi.fn<FetchLike>().mockResolvedValue(new Response('[]', { status: 200 }));

    await expect(hasModelNotesRoute(base, { fetchImpl: missing })).resolves.toBe(false);
    await expect(hasModelNotesRoute(base, { fetchImpl: present })).resolves.toBe(true);
    expect(present.mock.calls[0]?.[0]).toBe(`${base}/pysssss/loras`);
  });
});
