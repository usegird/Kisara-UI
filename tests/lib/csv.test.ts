import { describe, expect, it } from 'vitest';

import { parseCsv } from '@/lib/csv';

describe('読み', () => {
  it('囲まれた欄の中の改行・区切り・引用符を保つ', () => {
    const text = 'name,prompt\r\na,"1girl, solo\nnext ""quoted"" line"\r\n';

    expect(parseCsv(text)).toEqual([
      ['name', 'prompt'],
      ['a', '1girl, solo\nnext "quoted" line'],
    ]);
  });

  it('空の欄と、行区切りの余りを取り違えない', () => {
    expect(parseCsv('a,,c\r\n\r\n')).toEqual([['a', '', 'c']]);
  });

  it('末尾に改行が無くても最後の行を落とさない', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('囲みの中の記号・重ねた引用符・末尾の空白をそのまま読む', () => {
    const text = 'name,prompt\r\na,"1girl, solo\n{ || ** """"#},; "\r\n';

    expect(parseCsv(text)[1]).toEqual(['a', '1girl, solo\n{ || ** ""#},; ']);
  });
});
