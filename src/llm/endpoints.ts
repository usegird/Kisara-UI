import { parseHttpBaseUrl } from '@/lib/web-url';

export function normalizeLlmBaseUrl(baseUrl: string): string | null {
  const parsed = parseHttpBaseUrl(baseUrl);
  return parsed.kind === 'ok' ? parsed.url : null;
}

export function chatCompletionsUrl(base: string): string {
  return `${base}/chat/completions`;
}

export function modelsUrl(base: string): string {
  return `${base}/models`;
}

export function keyUrl(base: string): string {
  return `${base}/key`;
}

export function propsUrl(base: string): string {
  return `${base.replace(/\/v1$/, '')}/props`;
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

export function isMixedContent(target: string, pageProtocol: string | null): boolean {
  if (pageProtocol !== 'https:') return false;
  const url = new URL(target);
  return url.protocol === 'http:' && !LOOPBACK.test(url.hostname);
}
