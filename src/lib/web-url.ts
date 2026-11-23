const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const WEB_SCHEME = /^https?:\/\//i;
const TRAILING_SLASHES = /\/+$/;

export type HttpBaseUrl =
  | { readonly kind: 'ok'; readonly url: string }
  | { readonly kind: 'empty' | 'scheme' }
  | { readonly kind: 'invalid'; readonly cause: unknown };

export function isWebUrl(url: string | undefined): url is string {
  return url !== undefined && WEB_SCHEME.test(url.trim());
}

export function parseHttpBaseUrl(raw: string): HttpBaseUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const hasScheme = HAS_SCHEME.test(trimmed);
  if (hasScheme && !WEB_SCHEME.test(trimmed)) return { kind: 'scheme' };

  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `http://${trimmed}`);
  } catch (cause) {
    return { kind: 'invalid', cause };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'scheme' };
  return { kind: 'ok', url: `${url.origin}${url.pathname.replace(TRAILING_SLASHES, '')}` };
}
