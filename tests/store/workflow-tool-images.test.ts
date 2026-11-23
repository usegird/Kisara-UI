import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolArgument } from '@/graph/workflow-tool';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import {
  forgetPlacedImages,
  imageReferences,
  placeArgumentImages,
} from '@/store/run/workflow-tool-images';
import { useAvatarsStore } from '@/store/use-avatars-store';
import { useChatStore } from '@/store/use-chat-store';

import { chat, toolCallMessage } from '../helpers/llm';

const BASE = 'http://comfy';

const imageArg: ToolArgument = {
  nodeId: '12',
  input: 'image',
  name: 'source_image',
  description: '',
  mode: 'overwrite',
  schema: { type: 'string', enum: ['avatar'] },
  image: true,
};

const textArg: ToolArgument = {
  nodeId: '6',
  input: 'text',
  name: 'expression',
  description: '',
  mode: 'overwrite',
  schema: { type: 'string' },
};

const values = new Map([
  ['12', { image: 'avatar' }],
  ['6', { text: 'smile' }],
]);

let uploadTemp: ReturnType<typeof vi.fn<(file: File, subfolder: string) => Promise<string>>>;

function setAvatar(image: Blob | null): void {
  useAvatarsStore.setState({
    avatars: image === null ? {} : { a1: { id: 'a1', name: 'A', image, hash: 'h', createdAt: 0 } },
  });
  useChatStore.getState().update('c1', { imageId: image === null ? null : 'a1' });
}

beforeEach(() => {
  uploadTemp = vi.fn((file: File, subfolder: string) =>
    Promise.resolve(`${subfolder}/${file.name} [temp]`),
  );
  const port = comfyPort();
  installComfyPort({
    ...port,
    inputImages: {
      ...port.inputImages,
      uploadTemp: (_baseUrl, file, subfolder) => uploadTemp(file, subfolder),
    },
  });
  useChatStore.getState().put('c1', chat([], { preset: { id: 'p1', name: 'P' }, imageId: null }));
});

afterEach(() => {
  useChatStore.getState().unload('c1');
  forgetPlacedImages();
});

describe('画像の引数を置いて差し替える', () => {
  it('アバターを temp の kisara に中身のハッシュの名前で置き、置いた値にする', async () => {
    setAvatar(new Blob(['png'], { type: 'image/png' }));
    const placed = await placeArgumentImages('c1', BASE, [imageArg, textArg], values);
    const name = /^avatar-[0-9a-f]{16}\.png$/u;
    expect(uploadTemp).toHaveBeenCalledTimes(1);
    expect(uploadTemp.mock.calls[0]?.[0].name).toMatch(name);
    expect(uploadTemp.mock.calls[0]?.[1]).toBe('kisara');
    if (!placed.ok) throw new Error(placed.message);
    expect(placed.values.get('12')?.image).toMatch(/^kisara\/avatar-[0-9a-f]{16}\.png \[temp\]$/u);
    expect(placed.values.get('6')).toEqual({ text: 'smile' });
  });

  it('同じ画像は 2 回目から置かず、中身が変われば置き直す', async () => {
    setAvatar(new Blob(['png'], { type: 'image/png' }));
    await placeArgumentImages('c1', BASE, [imageArg], values);
    await placeArgumentImages('c1', BASE, [imageArg], values);
    expect(uploadTemp).toHaveBeenCalledTimes(1);
    setAvatar(new Blob(['other'], { type: 'image/jpeg' }));
    await placeArgumentImages('c1', BASE, [imageArg], values);
    expect(uploadTemp).toHaveBeenCalledTimes(2);
    expect(uploadTemp.mock.calls[1]?.[0].name).toMatch(/\.jpg$/u);
  });

  it('アバターが無ければ置かずに理由を返す。置けなければその理由', async () => {
    setAvatar(null);
    const missing = await placeArgumentImages('c1', BASE, [imageArg], values);
    expect(missing.ok).toBe(false);
    expect(uploadTemp).not.toHaveBeenCalled();

    setAvatar(new Blob(['png'], { type: 'image/png' }));
    uploadTemp.mockRejectedValueOnce(new Error('refused'));
    const failed = await placeArgumentImages('c1', BASE, [imageArg], values);
    expect(failed.ok).toBe(false);
  });

  it('画像の引数が無ければ何も置かず、値はそのまま', async () => {
    const placed = await placeArgumentImages('c1', BASE, [textArg], values);
    expect(uploadTemp).not.toHaveBeenCalled();
    expect(placed).toEqual({ ok: true, values });
  });
});

describe('受け取った画像を渡す', () => {
  const output = { filename: 'out_00001_.png', subfolder: '', type: 'output' };

  function receive(): void {
    const received = toolCallMessage('a1', [
      { id: 'c1', name: 'make_image', arguments: '{}', state: { kind: 'done', images: [output] } },
    ]);
    useChatStore.getState().put('c1', chat([received], { preset: { id: 'p1', name: 'P' } }));
  }

  it('選べる参照名はアバターが先、受け取った画像が後', () => {
    receive();
    expect(imageReferences(useChatStore.getState().chats.c1)).toEqual([
      'avatar',
      'output/out_00001_.png',
    ]);
    expect(imageReferences(undefined)).toEqual(['avatar']);
  });

  it('受け取った画像は置かずに、その値（置き場の印付き）を欄に入れる', async () => {
    receive();
    const picked = new Map([['12', { image: 'output/out_00001_.png' }]]);
    const placed = await placeArgumentImages('c1', BASE, [imageArg], picked);
    expect(uploadTemp).not.toHaveBeenCalled();
    expect(placed.ok && placed.values.get('12')?.image).toBe('out_00001_.png [output]');
  });

  it('会話で受け取っていない参照名は理由を返す', async () => {
    const picked = new Map([['12', { image: 'output/other.png' }]]);
    expect((await placeArgumentImages('c1', BASE, [imageArg], picked)).ok).toBe(false);
  });
});
