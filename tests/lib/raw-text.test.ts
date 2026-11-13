import { describe, expect, it } from 'vitest';

import { rawText } from '@/lib/raw-text';

describe('rawText', () => {
  it('物は字下げした JSON、文字はそのまま', () => {
    expect(rawText({ a: 1 }, 100).text).toBe('{\n  "a": 1\n}');
    expect(rawText('plain', 100).text).toBe('plain');
  });

  it('Blob・バイト列・長い data URL は種類と大きさの印に替える', () => {
    const url = `data:image/png;base64,${'A'.repeat(300)}`;
    const { text } = rawText(
      { image: new Blob(['abc'], { type: 'image/png' }), bytes: new Uint8Array(4), url },
      10_000,
    );
    expect(text).toContain('"<Blob image/png 3 B>"');
    expect(text).toContain('"<binary 4 B>"');
    expect(text).toContain(`"<data:image/png;base64,… ${url.length} chars>"`);
  });

  it('長ければ先頭だけにし、そう知らせる', () => {
    const found = rawText('x'.repeat(50), 10);
    expect(found).toEqual({ text: 'x'.repeat(10), truncated: true });
  });
});
