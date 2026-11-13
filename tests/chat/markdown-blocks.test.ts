import { describe, expect, it } from 'vitest';

import { splitMarkdownBlocks } from '@/chat/markdown-blocks';

// ─────────────────────────────
// 本文を Markdown の塊に分ける。受け取り中に確定した塊を描き直さないため。
// ─────────────────────────────

describe('塊に分ける', () => {
  it('空行で区切る', () => {
    expect(splitMarkdownBlocks('a\nb\n\nc\n\n\nd')).toEqual(['a\nb', 'c', 'd']);
  });

  it('コードブロックの中の空行では区切らない。閉じていなければ最後まで 1 つ', () => {
    expect(splitMarkdownBlocks('x\n\n```\n1\n\n2\n```\n\ny')).toEqual([
      'x',
      '```\n1\n\n2\n```',
      'y',
    ]);
    expect(splitMarkdownBlocks('```js\na\n\nb')).toEqual(['```js\na\n\nb']);
  });

  it('字下げした続きは手前の塊に入れる', () => {
    expect(splitMarkdownBlocks('- a\n\n  more\n\nnext')).toEqual(['- a\n\n  more', 'next']);
  });

  it('空の本文は空の列', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
    expect(splitMarkdownBlocks('\n\n')).toEqual([]);
  });
});
