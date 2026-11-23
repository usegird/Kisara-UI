import { describe, expect, it } from 'vitest';

import { gzipLines, LineTooLongError, readLines } from '@/lib/json-lines';

async function collect(blob: Blob, maxChars = 1000): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of readLines(blob, maxChars)) lines.push(line);
  return lines;
}

describe('JSON Lines と gzip', () => {
  it('縮めて書いた行を、そのまま順に読み戻す', async () => {
    const blob = await gzipLines(['{"a":1}', '{"b":"日本語"}'], 'application/gzip');
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect([...head]).toEqual([0x1f, 0x8b]);
    expect(await collect(blob)).toEqual(['{"a":1}', '{"b":"日本語"}']);
  });

  it('縮めていないファイルも読み、空の行と末尾の改行の無さを受け付ける', async () => {
    const blob = new Blob(['{"a":1}\n\n{"b":2}']);
    expect(await collect(blob)).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('上限を超える行は投げる（改行の来ない長い行も）', async () => {
    await expect(collect(new Blob(['x'.repeat(20), '\n']), 10)).rejects.toThrow(LineTooLongError);
    await expect(collect(new Blob(['y'.repeat(20)]), 10)).rejects.toThrow(LineTooLongError);
  });
});
