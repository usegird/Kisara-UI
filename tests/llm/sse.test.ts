import { describe, expect, it } from 'vitest';

import { createSseReader } from '@/llm/sse';

// ─────────────────────────────
// SSE の読み取り。区切りがどこで切れて届いても、`data:` の中身を 1 件ずつ返す。
// ─────────────────────────────

describe('SSE の読み取り', () => {
  it('空行で区切った出来事ごとに data を返し、event や注釈の行は使わない', () => {
    const reader = createSseReader();
    expect(reader.push(': keep-alive\nevent: x\ndata: {"a":1}\n\ndata: [DONE]\n\n')).toEqual([
      '{"a":1}',
      '[DONE]',
    ]);
  });

  it('注釈の行は data に入れず、中身だけを onComment に渡す', () => {
    const comments: string[] = [];
    const reader = createSseReader({ onComment: (text) => comments.push(text) });
    expect(reader.push(': OPENROUTER PROCESSING\n\ndata: x\n\n:\n')).toEqual(['x']);
    expect(comments).toEqual(['OPENROUTER PROCESSING', '']);
  });

  it('行の途中で切れて届いても、つないでから返す', () => {
    const reader = createSseReader();
    expect(reader.push('data: {"a"')).toEqual([]);
    expect(reader.push(':1}\n')).toEqual([]);
    expect(reader.push('\n')).toEqual(['{"a":1}']);
  });

  it('\\r\\n の区切りが \\r と \\n に分かれて届いても、空行を 1 つ余計に数えない', () => {
    const reader = createSseReader();
    expect(reader.push('data: x\r')).toEqual([]);
    expect(reader.push('\n\r\n')).toEqual(['x']);
  });

  it('1 つの出来事の複数の data 行は改行でつなぐ', () => {
    const reader = createSseReader();
    expect(reader.push('data: a\ndata: b\n\n')).toEqual(['a\nb']);
  });

  it('終わりに区切りの空行が無く残った出来事は flush で返す', () => {
    const reader = createSseReader();
    reader.push('data: tail');
    expect(reader.flush()).toEqual(['tail']);
  });
});
