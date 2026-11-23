import { LOCALES, SOURCE_LOCALE } from '../i18n/locales.ts';
import { welcomePathOf } from './paths.ts';

export function normalizeSiteUrl(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export function buildSeoHead(siteUrl: string | null, code: string): string {
  if (siteUrl === null) return '';
  const url = (language: string): string => escapeAttribute(`${siteUrl}${welcomePathOf(language)}`);
  const own = LOCALES.find((locale) => locale.code === code);
  const tags = [
    `<link rel="canonical" href="${url(code)}" />`,
    ...LOCALES.map(
      (locale) => `<link rel="alternate" hreflang="${locale.code}" href="${url(locale.code)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${url(SOURCE_LOCALE)}" />`,
    `<meta property="og:url" content="${url(code)}" />`,
  ];
  if (own !== undefined) tags.push(`<meta property="og:locale" content="${own.ogLocale}" />`);
  for (const locale of LOCALES) {
    if (locale.code === code) continue;
    tags.push(`<meta property="og:locale:alternate" content="${locale.ogLocale}" />`);
  }
  return tags.join('');
}

export function buildRobots(siteUrl: string | null): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (siteUrl !== null) lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

export function buildSitemap(siteUrl: string): string {
  const alternates = LOCALES.map(
    (locale) =>
      `    <xhtml:link rel="alternate" hreflang="${locale.code}" ` +
      `href="${escapeXml(siteUrl + welcomePathOf(locale.code))}"/>`,
  ).join('\n');
  const entries = LOCALES.map((locale) =>
    [
      '  <url>',
      `    <loc>${escapeXml(siteUrl + welcomePathOf(locale.code))}</loc>`,
      alternates,
      '  </url>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
      'xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeAttribute(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function escapeXml(text: string): string {
  return escapeAttribute(text).replaceAll('>', '&gt;');
}
