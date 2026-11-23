import { splitPlaceholders } from '../i18n/catalog-shape.ts';

const LINK_CLASS = 'agreement-link';

const URL_PATTERN = /(https:\/\/[^\s()（）]+)/;

const OPEN_TAG = String.raw`<(\w+)(\s[^>]*?)?\sdata-t="([^"]+)"([^>]*)>`;

const LEAF = new RegExp(String.raw`${OPEN_TAG}((?:(?!<template|<\/\1)[\s\S])*)<\/\1\s*>`, 'g');

const TEMPLATE = String.raw`<template data-part="([^"]+)"\s*>([\s\S]*?)<\/template\s*>`;

const WITH_PARTS = new RegExp(
  String.raw`${OPEN_TAG}((?:\s*${TEMPLATE.replace(/\((?!\?)/g, '(?:')})+\s*)<\/\1\s*>`,
  'g',
);

const PART = new RegExp(TEMPLATE, 'g');

const ATTRIBUTE = /<(\w+)([^>]*?)\sdata-t-(content|aria-label)="([^"]+)"([^>]*)>/g;

const LINES = /(<(\w+)[^>]*\sdata-lines="([^"]+)"[^>]*>)<\/\2>/g;

const LEGAL = /(<(\w+)[^>]*\sdata-legal="(terms|privacy)"[^>]*>)<\/\2>/g;

const ICON = /<i\s+data-icon="([^"]+)"\s+class="([^"]*)"\s*><\/i>/g;

export interface WelcomeSources {
  readonly message: (key: string) => string | undefined;
  readonly legal: (document: 'terms' | 'privacy') => string;
  readonly icon: (name: string, className: string) => string;
}

export function fillWelcome(html: string, sources: WelcomeSources): string {
  const text = (key: string): string => {
    const found = sources.message(key);
    if (found === undefined) throw new Error(`welcome page: unknown message key: ${key}`);
    return found;
  };
  return html
    .replace(LEAF, (...match: string[]) => fillElement(match, text, false))
    .replace(WITH_PARTS, (...match: string[]) => fillElement(match, text, true))
    .replace(ATTRIBUTE, (...match: string[]) => fillAttribute(match, text))
    .replace(LINES, (_whole, open: string, tag: string, key: string) => {
      const lineClass = /\sdata-line-class="([^"]*)"/.exec(open)?.[1] ?? '';
      const lines = text(key).split('\n');
      const body = lines.map((line) => `<p class="${lineClass}">${escapeHtml(line)}</p>`);
      return `${open}${body.join('')}</${tag}>`;
    })
    .replace(LEGAL, (_whole, open: string, tag: string, document: 'terms' | 'privacy') => {
      const paragraphs = sources.legal(document).split('\n\n');
      const body = paragraphs.map((p) => `<p class="whitespace-pre-wrap">${linkify(p)}</p>`);
      return `${open}${body.join('')}</${tag}>`;
    })
    .replace(ICON, (_whole, name: string, className: string) => sources.icon(name, className));
}

function fillElement(
  match: readonly string[],
  text: (key: string) => string,
  withParts: boolean,
): string {
  const [, tag = '', before = '', key = '', after = '', inner = ''] = match;
  const templates = withParts
    ? new Map([...inner.matchAll(PART)].map((m) => [m[1] ?? '', m[2] ?? '']))
    : new Map<string, string>();
  const body = fillText(text(key), templates, paramsOf(after + before));
  return `<${tag}${before} data-t="${key}"${after}>${body}</${tag}>`;
}

function fillAttribute(match: readonly string[], text: (key: string) => string): string {
  const [, tag = '', before = '', name = '', key = '', after = ''] = match;
  const rest = `${before}${after}`
    .replace(new RegExp(String.raw`\s${name}="[^"]*"`), '')
    .replace(/\s*\/$/, '');
  return `<${tag}${rest} ${name}="${escapeHtml(text(key))}">`;
}

function fillText(
  message: string,
  templates: ReadonlyMap<string, string>,
  params: ReadonlyMap<string, string>,
): string {
  return splitPlaceholders(message)
    .map((part, index) => {
      if (index % 2 === 0) return escapeHtml(part);
      const template = templates.get(part);
      if (template !== undefined) return template;
      return `<span data-param="${params.get(part) ?? part}"></span>`;
    })
    .join('');
}

function paramsOf(attributes: string): Map<string, string> {
  const raw = /\sdata-params="([^"]*)"/.exec(attributes)?.[1] ?? '';
  const pairs = raw
    .split(',')
    .filter((pair) => pair.includes(':'))
    .map((pair) => pair.split(':') as [string, string]);
  return new Map(pairs);
}

function linkify(text: string): string {
  return text
    .split(URL_PATTERN)
    .map((part, index) => {
      if (index % 2 === 0) return escapeHtml(part);
      const url = escapeHtml(part);
      const attributes = `target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}"`;
      return `<a href="${url}" ${attributes}>${url}</a>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
