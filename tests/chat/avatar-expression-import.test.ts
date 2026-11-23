import { describe, expect, it } from 'vitest';

import { importExpressions, type DroppedFile } from '@/chat/avatar-expression-import';

const MAX = 1000;

const file = (path: string, body: string, type = 'image/png'): DroppedFile => ({
  file: new File([body], path.split('/').at(-1) ?? path, { type }),
  path,
});

async function bytesOf(image: Blob | undefined): Promise<number[]> {
  return image === undefined ? [] : [...new Uint8Array(await image.arrayBuffer())];
}

describe('ファイル名', () => {
  it('画像のファイル名から拡張子を除いてラベルにし、画像でない・大きすぎるものは飛ばす', async () => {
    const read = await importExpressions(
      [
        file('expressions/joy.png', 'j'),
        file('expressions/sad.webp', 's', ''),
        file('expressions/readme.txt', 't', 'text/plain'),
        file('expressions/big.png', 'x'.repeat(MAX + 1)),
      ],
      MAX,
    );
    expect(read.entries.map((entry) => [entry.label, entry.image.type])).toEqual([
      ['joy', 'image/png'],
      ['sad', 'image/webp'],
    ]);
    expect(read.skipped).toEqual(['readme.txt', 'big.png']);
  });
});

describe('CCv3', () => {
  const card = (assets: unknown[]): DroppedFile =>
    file('char/card.json', JSON.stringify({ data: { assets } }), 'application/json');

  it('emotion の資産だけを name のラベルで読み、embeded:// は相対パス → ファイル名で探す', async () => {
    const read = await importExpressions(
      [
        card([
          { type: 'icon', name: 'main', uri: 'embeded://assets/icon.png', ext: 'png' },
          { type: 'emotion', name: 'happy', uri: 'embeded://assets/emotion/a.png', ext: 'png' },
          { type: 'emotion', name: 'angry', uri: 'embeded://other/b.png', ext: 'png' },
          { type: 'emotion', name: 'web', uri: 'https://example.com/c.png', ext: 'png' },
          { type: 'emotion', name: 'inline', uri: 'data:image/png;base64,AAEC', ext: 'png' },
        ]),
        file('char/assets/icon.png', 'i'),
        file('char/assets/emotion/a.png', 'a'),
        file('loose/b.png', 'b'),
        file('char/extra.png', 'e'),
      ],
      MAX,
    );
    expect(read.entries.map((entry) => entry.label)).toEqual(['happy', 'angry', 'inline']);
    expect(await read.entries[0]?.image.text()).toBe('a');
    expect(await bytesOf(read.entries[2]?.image)).toEqual([0, 1, 2]);
    expect(read.skipped).toEqual(['web']);
  });

  it('読めないカードは飛ばす', async () => {
    const read = await importExpressions([file('card.json', '{', 'application/json')], MAX);
    expect(read).toEqual({ entries: [], skipped: ['card.json'] });
  });
});
