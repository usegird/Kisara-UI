import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  AppWindow,
  ArrowDown,
  ArrowUpDown,
  Bot,
  Cloud,
  Laptop,
  Server,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Plugin } from 'vite';

import { lookupEntry } from '../src/i18n/catalog-shape.ts';
import { LOCALES, SOURCE_LOCALE } from '../src/i18n/locales.ts';
import { fillWelcome } from '../src/welcome/fill.ts';
import { buildRobots, buildSeoHead, buildSitemap, normalizeSiteUrl } from '../src/welcome/seo.ts';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  'app-window': AppWindow,
  'arrow-down': ArrowDown,
  'arrow-up-down': ArrowUpDown,
  bot: Bot,
  cloud: Cloud,
  laptop: Laptop,
  server: Server,
  workflow: Workflow,
  x: X,
};

const SOURCE_HTML_LANG = '<html lang="en">';

const ASSET_MARK = /__VITE_ASSET__([\w$]+)__(?:\$_(.*?)__)?/g;

export function welcomePages(root: string, siteUrl: string | undefined): Plugin {
  const entry = resolve(root, 'index.html');
  let unfilled: string | null = null;
  return {
    name: 'kisara:welcome-pages',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (resolve(context.filename) !== entry) return html;
        if (context.server === undefined) unfilled = html;
        const code = codeOfPath(context.originalUrl ?? context.path);
        return fillPage(root, html, code, siteUrl);
      },
    },
    generateBundle: {
      order: 'post',
      handler() {
        if (unfilled === null) return;
        const html = unfilled.replace(ASSET_MARK, (_whole, id: string, suffix?: string) => {
          return `/${this.getFileName(id)}${suffix ?? ''}`;
        });
        for (const { code } of LOCALES) {
          if (code === SOURCE_LOCALE) continue;
          const source = fillPage(root, html, code, siteUrl);
          this.emitFile({ type: 'asset', fileName: `${code}/index.html`, source });
        }
        const site = normalizeSiteUrl(siteUrl);
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobots(site) });
        if (site !== null) {
          this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap(site) });
        }
      },
    },
  };
}

function codeOfPath(path: string): string {
  const head = path.split('/')[1] ?? '';
  return LOCALES.find((locale) => locale.code === head)?.code ?? SOURCE_LOCALE;
}

export function fillPage(
  root: string,
  html: string,
  code: string,
  siteUrl: string | undefined,
): string {
  const own = readCatalog(root, code);
  const source = readCatalog(root, SOURCE_LOCALE);
  const filled = fillWelcome(html, {
    message: (key) => textOf(lookupEntry(own, key) ?? lookupEntry(source, key)),
    legal: (document) => readLegal(root, code, document),
    icon: (name, className) => {
      const icon = ICONS[name];
      if (icon === undefined) throw new Error(`はじめの画面: 知らないアイコン: ${name}`);
      return renderToStaticMarkup(createElement(icon, { className, 'aria-hidden': true }));
    },
  });
  return filled
    .replace(SOURCE_HTML_LANG, `<html lang="${code}">`)
    .replace('</head>', `${buildSeoHead(normalizeSiteUrl(siteUrl), code)}</head>`);
}

function readCatalog(root: string, code: string): unknown {
  return JSON.parse(readFileSync(join(root, 'src/i18n/locales', `${code}.json`), 'utf8'));
}

function readLegal(root: string, code: string, document: string): string {
  const own = join(root, 'legal', code, `${document}.txt`);
  const path = existsSync(own) ? own : join(root, 'legal', SOURCE_LOCALE, `${document}.txt`);
  return readFileSync(path, 'utf8');
}

function textOf(entry: ReturnType<typeof lookupEntry>): string | undefined {
  if (entry === undefined) return undefined;
  return typeof entry === 'string' ? entry : entry.other;
}
