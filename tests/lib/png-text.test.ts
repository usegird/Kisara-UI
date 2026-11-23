import { describe, expect, it } from 'vitest';

import { readPngTextChunks } from '@/lib/png-text';

import { png, textChunk } from '../helpers/png';

describe('PNG のテキストチャンク', () => {
  it('キーワードごとに読める', () => {
    const buffer = png(textChunk('prompt', '{"1":{"class_type":"X"}}'), textChunk('foo', 'bar'));
    const chunks = readPngTextChunks(buffer);

    expect(chunks.get('prompt')).toBe('{"1":{"class_type":"X"}}');
    expect(chunks.get('foo')).toBe('bar');
  });

  it('日本語も読める', () => {
    expect(readPngTextChunks(png(textChunk('prompt', 'ポジ側'))).get('prompt')).toBe('ポジ側');
  });

  it('PNG でなければ空', () => {
    expect(readPngTextChunks(new Uint8Array([1, 2, 3]).buffer).size).toBe(0);
  });

  it('途中で切れていても落ちない', () => {
    const full = new Uint8Array(png(textChunk('prompt', 'abcdefg')));

    expect(readPngTextChunks(full.slice(0, 14).buffer).size).toBe(0);
  });
});
