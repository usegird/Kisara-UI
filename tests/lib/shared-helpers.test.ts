import { afterAll, describe, expect, it } from 'vitest';

import { textWithDelta } from '@/chat/stream-receive';
import { activeLocale, initLocale } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { toSlashPath, withoutExtension } from '@/lib/file-name';
import { isString, stringArray, stringOr } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { compositeKey, omitKey } from '@/lib/own-key';
import { parseHttpBaseUrl } from '@/lib/web-url';

describe('stringOr / stringArray / isString', () => {
  it('文字列でなければ既定（渡さなければ空）を返す', () => {
    expect(stringOr('a')).toBe('a');
    expect(stringOr(1)).toBe('');
    expect(stringOr(undefined, null)).toBeNull();
    expect(isString('')).toBe(true);
  });

  it('配列の中の文字列だけを残し、配列でなければ空', () => {
    expect(stringArray(['a', 1, 'b', null])).toEqual(['a', 'b']);
    expect(stringArray('a')).toEqual([]);
  });
});

describe('omitKey / compositeKey', () => {
  it('鍵を 1 つ外した写しを返し、元は変えない', () => {
    const record = { a: 1, b: 2 };
    expect(omitKey(record, 'a')).toEqual({ b: 2 });
    expect(record).toEqual({ a: 1, b: 2 });
  });

  it('区切りをまたいで同じ鍵にならない', () => {
    expect(compositeKey('a', 'bc')).not.toBe(compositeKey('ab', 'c'));
  });
});

describe('newShortId', () => {
  it('英小文字と数字の 8 文字', () => {
    expect(newShortId()).toMatch(/^[a-z0-9]{8}$/u);
  });
});

describe('withoutExtension / toSlashPath', () => {
  it('最後の要素の拡張子だけを外し、ディレクトリの点は残す', () => {
    expect(withoutExtension('loras/a.v1/b.safetensors')).toBe('loras/a.v1/b');
    expect(withoutExtension('dir.x/name')).toBe('dir.x/name');
  });

  it('区切りを `/` に揃える', () => {
    expect(toSlashPath('a\\b/c')).toBe('a/b/c');
  });
});

describe('parseHttpBaseUrl', () => {
  it('スキームを足し、末尾の / を落とし、パスは残す', () => {
    expect(parseHttpBaseUrl(' 127.0.0.1:8188/comfy/ ')).toEqual({
      kind: 'ok',
      url: 'http://127.0.0.1:8188/comfy',
    });
  });

  it('空・http(s) でない・組み立てられないは理由を返す', () => {
    expect(parseHttpBaseUrl('  ').kind).toBe('empty');
    expect(parseHttpBaseUrl('ftp://example.com').kind).toBe('scheme');
    expect(parseHttpBaseUrl('http://[').kind).toBe('invalid');
  });
});

describe('textWithDelta', () => {
  it('届いた本文を足し、1 つの JSON で返ったらそれを全体にする', () => {
    expect(textWithDelta('ab', { kind: 'delta', content: 'c', reasoning: '' })).toBe('abc');
    expect(textWithDelta('ab', { kind: 'delta', content: 'xy', reasoning: '', whole: true })).toBe(
      'xy',
    );
  });
});

describe('formatNumber', () => {
  afterAll(() => initLocale('ja'));

  it('画面の言語の書き方で出す', async () => {
    await initLocale('en');
    expect(formatNumber(12345.678, { maximumFractionDigits: 1 })).toBe('12,345.7');
    await initLocale('de');
    expect(formatNumber(12345.678, { maximumFractionDigits: 1 })).toBe(
      (12345.678).toLocaleString(activeLocale(), { maximumFractionDigits: 1 }),
    );
  });
});
