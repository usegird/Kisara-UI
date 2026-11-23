import { afterAll, describe, expect, it } from 'vitest';

import { activeLocale, initLocale, t } from '@/i18n';
import { formatEntry, interpolate } from '@/i18n/catalog-shape';
import { LOCALES, matchLocale, resolveLocale } from '@/i18n/locales';

describe('resolveLocale', () => {
  it('残した言語を最優先する', () => {
    expect(resolveLocale('ja', ['en-US'])).toBe('ja');
  });

  it('残した言語が一覧に無ければブラウザの言語で決める', () => {
    expect(resolveLocale('fr', ['fr-FR', 'ja-JP', 'en'])).toBe('ja');
  });

  it('どれにも当てはまらなければ英語', () => {
    expect(resolveLocale(null, ['fr-FR', 'zh-TW'])).toBe('en');
  });
});

describe('matchLocale', () => {
  it.each([
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-Hans-HK', 'zh-Hans'],
    ['ja-JP', 'ja'],
    ['EN-gb', 'en'],
  ])('%s → %s', (tag, code) => {
    expect(matchLocale(tag)?.code).toBe(code);
  });

  it.each(['zh-TW', 'zh-Hant', 'zh-HK', 'eng', 'jav'])('%s は当てはめない', (tag) => {
    expect(matchLocale(tag)).toBeUndefined();
  });
});

describe('LOCALES', () => {
  it('言語の符号の文字順に並ぶ', () => {
    const codes = LOCALES.map((locale) => locale.code.toLowerCase());
    expect(codes).toEqual([...codes].sort());
  });
});

describe('formatEntry', () => {
  const en = { plural: new Intl.PluralRules('en'), number: new Intl.NumberFormat('en') };
  const nodes = { one: '{count} node', other: '{count} nodes' };

  it('数で分類を選び、数は桁区切りで差し込む', () => {
    expect(formatEntry(nodes, en, { count: 1 })).toBe('1 node');
    expect(formatEntry(nodes, en, { count: 1200 })).toBe('1,200 nodes');
  });

  it('count が無ければ other', () => {
    expect(formatEntry(nodes, en, {})).toBe('{count} nodes');
  });

  it('値の無い印はそのまま残す', () => {
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });
});

describe('t', () => {
  afterAll(() => initLocale('ja'));

  it('読み込んだ言語の表から引く', async () => {
    await initLocale('zh-Hans');
    expect(activeLocale()).toBe('zh-Hans');
    expect(t('settings.language.label')).toBe('语言');
  });

  it('一覧に無い言語は英語で続ける', async () => {
    await initLocale('fr');
    expect(activeLocale()).toBe('en');
    expect(t('settings.language.label')).toBe('Language');
  });
});
