import { describe, expect, it } from 'vitest';

import { buildRobots, buildSeoHead, buildSitemap, normalizeSiteUrl } from '@/welcome/seo';

const SITE = 'https://example.test';

describe('公開先の URL', () => {
  it('末尾の / を除き、空なら印を出さない', () => {
    expect(normalizeSiteUrl(' https://example.test/ ')).toBe(SITE);
    expect(normalizeSiteUrl('')).toBeNull();
    expect(normalizeSiteUrl(undefined)).toBeNull();
    expect(buildSeoHead(null, 'ja')).toBe('');
  });
});

describe('頁の印', () => {
  it('自分を正とし、3 つの言語と既定を互いに指し、カードの URL と言語を自分にする', () => {
    const head = buildSeoHead(SITE, 'ja');
    expect(head).toContain('<link rel="canonical" href="https://example.test/ja/" />');
    expect(head.match(/hreflang=/g)).toHaveLength(4);
    expect(head).toContain('hreflang="x-default" href="https://example.test/"');
    expect(head).toContain('<meta property="og:url" content="https://example.test/ja/" />');
    expect(head).toContain('<meta property="og:locale" content="ja_JP" />');
    expect(head.match(/og:locale:alternate/g)).toHaveLength(2);
    expect(head).not.toContain('og:locale:alternate" content="ja_JP"');
  });
});

describe('robots.txt と sitemap.xml', () => {
  it('robots.txt はすべてを許し、公開先があるときだけ sitemap の行を持つ', () => {
    expect(buildRobots(null)).toBe('User-agent: *\nAllow: /\n');
    expect(buildRobots(SITE)).toContain('Sitemap: https://example.test/sitemap.xml');
  });

  it('sitemap ははじめの画面の 3 つの言語を載せ、本体の頁を載せない', () => {
    const sitemap = buildSitemap(SITE);
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([`${SITE}/`, `${SITE}/ja/`, `${SITE}/zh-Hans/`]);
    expect(sitemap.match(/<xhtml:link /g)).toHaveLength(9);
    expect(sitemap).not.toContain('/app/');
  });
});
