// ─────────────────────────────
// `http` と `https` の URL の見分けと整え。外から来た URL（LLM の本文・出典など）は `http` と
// `https` だけをリンクにし、ほか（`javascript:`・`data:` など）は文字のまま出す。
// ─────────────────────────────

/** スキームが付いているか */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** `http://` か `https://` で始まるか */
const WEB_SCHEME = /^https?:\/\//i;
/** 末尾の `/` の並び */
const TRAILING_SLASHES = /\/+$/;

/** 接続先の URL を整えた結果。整えられなければ理由 */
export type HttpBaseUrl =
  | { readonly kind: 'ok'; readonly url: string }
  | { readonly kind: 'empty' | 'scheme' }
  | { readonly kind: 'invalid'; readonly cause: unknown };

/** `http://` か `https://` で始まる URL か */
export function isWebUrl(url: string | undefined): url is string {
  return url !== undefined && WEB_SCHEME.test(url.trim());
}

/**
 * 接続先の URL を整える。前後の空白と末尾の `/` を落とし、スキームが無ければ `http://` を足す。
 * **パスは残す**（リバースプロキシ配下の `/comfy`・多くの LLM のサーバーの `/v1`）
 */
export function parseHttpBaseUrl(raw: string): HttpBaseUrl {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  // スキームが付いているのに http(s) でない場合は、http:// を足さずに弾く
  // （足すと `http://ftp://example.com` のような別物として解釈されてしまう）
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
