import { describe, expect, it } from 'vitest';

import { escapeFileName } from '@/lib/file-name';

const bytes = (text: string): number => new TextEncoder().encode(text).length;

describe('退避', () => {
  it('使える文字（日本語も）はそのまま残す', () => {
    expect(escapeFileName('アニメ style.v2')).toBe('アニメ style.v2');
  });

  it('使えない文字と ~ は ~ と 16 進 2 桁にし、% は残す', () => {
    expect(escapeFileName('a:b')).toBe('a~3Ab');
    expect(escapeFileName('100%20')).toBe('100%20');
    expect(escapeFileName('a~b')).toBe('a~7Eb');
  });

  it('_ に寄せる置き換えと違い、違う名前は重ならない', () => {
    const escaped = ['a:b', 'a_b', 'a?b', 'a~3Ab'].map(escapeFileName);

    expect(new Set(escaped).size).toBe(4);
  });

  it('末尾の . と空白、Windows の予約名を別の名前にする', () => {
    expect(escapeFileName('a.')).toBe('a~2E');
    expect(escapeFileName('..')).toBe('.~2E');
    expect(escapeFileName('a ')).toBe('a~20');
    expect(escapeFileName('CON')).toBe('~43ON');
    expect(escapeFileName('nul.txt')).toBe('~6Eul.txt');
  });

  it('長すぎるときだけ切ってハッシュを付け、上限に収める', () => {
    const long = escapeFileName('あ'.repeat(100));

    expect(bytes(long)).toBeLessThanOrEqual(200);
    expect(long).toContain('~~');
    expect(escapeFileName('あ'.repeat(101))).not.toBe(long);
  });
});
