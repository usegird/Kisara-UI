import { describe, expect, it } from 'vitest';

import {
  buildPng,
  crc32,
  createZtxtChunk,
  readPngChunks,
  readZtxtText,
  textKeywordOf,
} from '@/lib/png-chunks';
import { readPngTextChunks } from '@/lib/png-text';

const encoder = new TextEncoder();

function samplePng(): Uint8Array<ArrayBuffer> {
  return buildPng([
    { type: 'IHDR', data: new Uint8Array(13) },
    { type: 'IDAT', data: Uint8Array.of(1, 2, 3) },
    { type: 'tEXt', data: encoder.encode('workflow\0{}') },
    { type: 'IEND', data: new Uint8Array(0) },
  ]);
}

describe('CRC', () => {
  it('IEND の CRC は仕様の値になる', () => {
    expect(crc32(encoder.encode('IEND'))).toBe(0xae426082);
  });
});

describe('並べ直し', () => {
  it('組み立てた PNG をチャンクに分け、同じ種別と中身に戻る', () => {
    const chunks = readPngChunks(samplePng().buffer);
    expect(chunks?.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'tEXt', 'IEND']);
    expect([...(chunks?.[1]?.data ?? [])]).toEqual([1, 2, 3]);
    expect(readPngTextChunks(samplePng().buffer).get('workflow')).toBe('{}');
  });

  it('PNG でない・IEND が無ければ null', () => {
    expect(readPngChunks(encoder.encode('not png').buffer)).toBeNull();
    const cut = samplePng().slice(0, -12);
    expect(readPngChunks(cut.buffer)).toBeNull();
  });
});

describe('zTXt', () => {
  it('縮めて書き、同じ本文に戻す', async () => {
    const text = 'abc'.repeat(1000);
    const chunk = await createZtxtChunk('kisara-test', text);
    expect(textKeywordOf(chunk)).toBe('kisara-test');
    expect(chunk.data.length).toBeLessThan(text.length);
    expect(await readZtxtText(chunk)).toBe(text);
  });

  it('壊れた本文は null', async () => {
    const chunk = { type: 'zTXt', data: Uint8Array.of(...encoder.encode('k'), 0, 0, 1, 2, 3) };
    expect(await readZtxtText(chunk)).toBeNull();
  });
});
