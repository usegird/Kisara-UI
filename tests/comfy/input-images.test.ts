import { describe, expect, it, vi } from 'vitest';

import { ComfyRequestError, type FetchLike } from '@/comfy/client';
import {
  inputImageRef,
  inputImageSrc,
  uploadedImageValue,
  uploadInputImage,
  uploadTempImage,
} from '@/comfy/input-images';

// ─────────────────────────────
// 入力画像の取り口とアップロード。応答の形は本体のソースで確かめたもの。
// 実機では叩かない（入力フォルダへ書くため）。
// ─────────────────────────────

const base = 'http://127.0.0.1:8188';

describe('値から画像の取り口を作る', () => {
  it('印が無ければ入力フォルダ、区切りの前はサブフォルダ', () => {
    expect(inputImageRef('a.png')).toEqual({ filename: 'a.png', subfolder: '', type: 'input' });
    expect(inputImageRef('pets\\dog.png')).toMatchObject({
      filename: 'dog.png',
      subfolder: 'pets',
    });
  });

  it('末尾の印は置き場として読む', () => {
    expect(inputImageRef('out/x.png [output]')).toEqual({
      filename: 'x.png',
      subfolder: 'out',
      type: 'output',
    });
  });

  it('URL は /view を指し、接続先が無ければ作らない', () => {
    expect(inputImageSrc(base, 'a b.png')).toBe(
      `${base}/view?filename=a+b.png&type=input&subfolder=`,
    );
    expect(inputImageSrc('', 'a.png')).toBeNull();
    expect(inputImageSrc(base, '')).toBeNull();
  });
});

describe('置いた画像を値にする', () => {
  it('入力フォルダなら印を付けず、サブフォルダは区切りでつなぐ', () => {
    expect(uploadedImageValue({ name: 'a.png', subfolder: '', type: 'input' })).toBe('a.png');
    expect(uploadedImageValue({ name: 'a.png', subfolder: 's', type: 'temp' })).toBe(
      's/a.png [temp]',
    );
  });
});

describe('アップロード', () => {
  it('multipart で入力フォルダへ送り、上書きを頼まない', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        new Response(JSON.stringify({ name: 'a (1).png', subfolder: '', type: 'input' })),
      );
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    expect(await uploadInputImage(base, file, { fetchImpl })).toBe('a (1).png');

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`${base}/upload/image`);
    expect(init?.method).toBe('POST');
    const form = init?.body;
    if (!(form instanceof FormData)) throw new Error('multipart で送っていない');
    expect(form.get('type')).toBe('input');
    expect(form.has('overwrite')).toBe(false);
  });

  it('応答に名前が無ければ失敗にする（置けたふりをしない）', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('{}'));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const error = await uploadInputImage(base, file, { fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ComfyRequestError);
    expect(error).toMatchObject({ kind: 'parse', reasonCode: 'upload-unexpected' });
  });
});
describe('temp へのアップロード', () => {
  it('temp のサブフォルダへ送り、[temp] 付きの値を返す。上書きを頼まない', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(
        new Response(JSON.stringify({ name: 'a.png', subfolder: 'kisara', type: 'temp' })),
      );
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    expect(await uploadTempImage(base, file, 'kisara', { fetchImpl })).toBe('kisara/a.png [temp]');
    const form = fetchImpl.mock.calls[0]?.[1]?.body;
    if (!(form instanceof FormData)) throw new Error('multipart で送っていない');
    expect([form.get('type'), form.get('subfolder'), form.has('overwrite')]).toEqual([
      'temp',
      'kisara',
      false,
    ]);
  });
});
