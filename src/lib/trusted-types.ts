import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// Trusted Types の既定の方針。依存が使う決まった形だけを通し、ほかは投げて止める。
// ─────────────────────────────

// TypeScript の DOM の型に Trusted Types が無いので、使う形だけをここで書く。
// スクリプトの文字列は通さない（方針に作り方を置かない）
interface PolicyRules {
  readonly createHTML: (input: string) => string;
  readonly createScriptURL: (input: string) => string;
}

interface PolicyFactory {
  readonly defaultPolicy: unknown;
  readonly createPolicy: (name: string, rules: PolicyRules) => unknown;
}

const ENTITY = /^&(#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{0,31});$/i;

/** 通してよい HTML か。通さなければ投げる */
export function allowedHtml(input: string): string {
  if (input === '' || ENTITY.test(input)) return input;
  throw new TypeError('Trusted Types: this HTML is not allowed');
}

/** 通してよいスクリプトの URL か（同じオリジンだけ。`blob:` は同じオリジンでも通さない）。通さなければ投げる */
export function allowedScriptUrl(input: string, origin: string): string {
  const url = new URL(input, origin);
  if (url.protocol !== 'blob:' && url.origin === origin) return input;
  throw new TypeError('Trusted Types: this script URL is not allowed');
}

function isPolicyFactory(value: unknown): value is PolicyFactory {
  return isRecord(value) && typeof value.createPolicy === 'function';
}

/**
 * 既定の方針を入れる。入口から 1 度だけ呼ぶ。既定の方針が既にあれば何もしない。
 * Trusted Types を持たないブラウザでは何もしない（CSP の指定も無視される）
 */
export function installTrustedTypes(): void {
  const factory: unknown = Reflect.get(globalThis, 'trustedTypes');
  if (!isPolicyFactory(factory) || factory.defaultPolicy !== null) return;
  const origin = globalThis.location.origin;
  factory.createPolicy('default', {
    createHTML: allowedHtml,
    createScriptURL: (input) => allowedScriptUrl(input, origin),
  });
}
