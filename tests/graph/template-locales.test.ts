import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEMPLATE_LOCALE,
  pickTemplateLocale,
  TEMPLATE_LOCALES,
} from '@/graph/template-locales';

describe('pickTemplateLocale', () => {
  it('ブラウザの優先言語から最初に合うもの', () => {
    expect(pickTemplateLocale(['xx', 'ja-JP', 'en'])).toBe('ja');
    expect(pickTemplateLocale(['pt-PT'])).toBe('pt-BR');
    expect(pickTemplateLocale(['zh-HK'])).toBe('zh-TW');
    expect(pickTemplateLocale(['zh-Hant-TW'])).toBe('zh-TW');
    expect(pickTemplateLocale(['zh-CN'])).toBe('zh');
  });

  it('大文字小文字を区別せずに符号と合わせる', () => {
    expect(pickTemplateLocale(['PT-br'])).toBe('pt-BR');
  });

  it('どれも合わなければ既定の英語', () => {
    expect(pickTemplateLocale(['de-DE'])).toBe(DEFAULT_TEMPLATE_LOCALE);
    expect(pickTemplateLocale([])).toBe(DEFAULT_TEMPLATE_LOCALE);
  });
});

describe('TEMPLATE_LOCALES', () => {
  it('言語の符号の文字順に並ぶ', () => {
    const codes = TEMPLATE_LOCALES.map((entry) => entry.code.toLowerCase());
    expect(codes).toEqual([...codes].sort());
  });

  it('既定の言語を含む', () => {
    expect(TEMPLATE_LOCALES.some((entry) => entry.code === DEFAULT_TEMPLATE_LOCALE)).toBe(true);
  });
});
