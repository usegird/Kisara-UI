import { describe, expect, it } from 'vitest';

import * as client from '@/comfy/client';
import { ComfyRequestError } from '@/comfy/request-error';
import * as stub from '@/demo/stubs/comfy-client';
import { fetchJson, postText } from '@/demo/stubs/comfy-client';

describe('デモの送る処理の代わり', () => {
  it('取りに行かず、届かなかった失敗で断る', async () => {
    const error: unknown = await fetchJson('/object_info').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ComfyRequestError);
    expect((error as ComfyRequestError).kind).toBe('unreachable');
  });

  it('送る側も同じく断る', async () => {
    await expect(postText('/userdata/x', 'body')).rejects.toBeInstanceOf(ComfyRequestError);
  });

  it('本物の窓口と同じ名前をすべて出す（抜けるとデモの開発サーバで読み込みが止まる）', () => {
    expect(Object.keys(stub).sort()).toEqual(Object.keys(client).sort());
  });
});
