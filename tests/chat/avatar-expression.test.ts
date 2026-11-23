import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXPRESSION_LABEL,
  expressionImageOf,
  readExpressionSet,
  stripExpressionChunks,
  writeExpressionSet,
  type ExpressionSet,
} from '@/chat/avatar-expression';
import { createZtxtChunk, readPngChunks, textKeywordOf } from '@/lib/png-chunks';
import { readPngTextChunks } from '@/lib/png-text';

import { minimalPngBlob } from '../helpers/png';

const encoder = new TextEncoder();

const webp = (text: string): Blob => new Blob([text], { type: 'image/webp' });

async function keywordsOf(image: Blob): Promise<string[]> {
  const chunks = readPngChunks(await image.arrayBuffer()) ?? [];
  return chunks.map(textKeywordOf).filter((keyword) => keyword !== null);
}

describe('読む', () => {
  it('目録の無い画像は、今の画像だけの表情差分', async () => {
    const image = minimalPngBlob();
    const read = await readExpressionSet(image);
    expect(read.kind === 'ok' && read.set.defaultLabel).toBe(DEFAULT_EXPRESSION_LABEL);
    expect(read.kind === 'ok' && read.set.items[0]?.image).toBe(image);
  });

  it('版が新しい目録は読めない', async () => {
    const manifest = await createZtxtChunk(
      'kisara-expressions',
      '{"v":2,"default":"a","items":[]}',
    );
    expect((await readExpressionSet(minimalPngBlob([manifest]))).kind).toBe('unreadable');
  });
});

describe('書いて読む', () => {
  const original = minimalPngBlob([{ type: 'tEXt', data: encoder.encode('chara\0card') }]);
  const set: ExpressionSet = {
    defaultLabel: 'neutral',
    items: [
      { label: 'neutral', image: original },
      { label: '笑顔', image: webp('smile') },
      { label: 'sad', image: webp('sad') },
    ],
  };

  it('並びとラベル（ASCII の外も）と画像の種類が戻り、ほかのテキストのチャンクを残す', async () => {
    const written = await writeExpressionSet(original, original, set);
    expect(readPngTextChunks(await written.arrayBuffer()).get('chara')).toBe('card');
    const read = await readExpressionSet(written);
    if (read.kind !== 'ok') throw new Error('unreadable');
    expect(read.set.items.map((item) => item.label)).toEqual(['neutral', '笑顔', 'sad']);
    const smile = expressionImageOf(read.set, '笑顔');
    expect(smile?.type).toBe('image/webp');
    expect(await smile?.text()).toBe('smile');
    expect(expressionImageOf(read.set, 'angry')).toBe(written);
  });

  it('書き直すたびに番号を 0 から振り直し、表情を減らすと前のチャンクを残さない', async () => {
    const first = await writeExpressionSet(original, original, set);
    const second = await writeExpressionSet(first, first, {
      defaultLabel: 'neutral',
      items: [
        { label: 'neutral', image: first },
        { label: 'sad', image: webp('sad') },
      ],
    });
    const keywords = await keywordsOf(second);
    expect(keywords.filter((keyword) => keyword.startsWith('kisara-expr:'))).toEqual([
      'kisara-expr:0',
    ]);
  });

  it('既定だけなら目録を書かない', async () => {
    const first = await writeExpressionSet(original, original, set);
    const only = await writeExpressionSet(first, first, {
      defaultLabel: 'neutral',
      items: [{ label: 'neutral', image: first }],
    });
    expect(await keywordsOf(only)).toEqual(['chara']);
  });

  it('既定を替えると、元の画像のテキストのチャンクを新しい既定の PNG に移す', async () => {
    const next = minimalPngBlob();
    const written = await writeExpressionSet(original, next, {
      defaultLabel: 'sad',
      items: [
        { label: 'neutral', image: webp('old') },
        { label: 'sad', image: next },
      ],
    });
    expect(await keywordsOf(written)).toContain('chara');
  });

  it('ワークフローに渡す画像は表情のチャンクを外す', async () => {
    const written = await writeExpressionSet(original, original, set);
    expect(await keywordsOf(await stripExpressionChunks(written))).toEqual(['chara']);
    expect(await stripExpressionChunks(original)).toBe(original);
  });
});
