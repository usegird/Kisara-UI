import { isRecord } from '@/lib/guards';

interface PolicyRules {
  readonly createHTML: (input: string) => string;
  readonly createScriptURL: (input: string) => string;
}

interface PolicyFactory {
  readonly defaultPolicy: unknown;
  readonly createPolicy: (name: string, rules: PolicyRules) => unknown;
}

const ENTITY = /^&(#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{0,31});$/i;

export function allowedHtml(input: string): string {
  if (input === '' || ENTITY.test(input)) return input;
  throw new TypeError('Trusted Types: this HTML is not allowed');
}

export function allowedScriptUrl(input: string, origin: string): string {
  const url = new URL(input, origin);
  if (url.protocol !== 'blob:' && url.origin === origin) return input;
  throw new TypeError('Trusted Types: this script URL is not allowed');
}

function isPolicyFactory(value: unknown): value is PolicyFactory {
  return isRecord(value) && typeof value.createPolicy === 'function';
}

export function installTrustedTypes(): void {
  const factory: unknown = Reflect.get(globalThis, 'trustedTypes');
  if (!isPolicyFactory(factory) || factory.defaultPolicy !== null) return;
  const origin = globalThis.location.origin;
  factory.createPolicy('default', {
    createHTML: allowedHtml,
    createScriptURL: (input) => allowedScriptUrl(input, origin),
  });
}
