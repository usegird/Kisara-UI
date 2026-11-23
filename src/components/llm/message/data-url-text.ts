const SHORTEN_ABOVE = 64;

const SHORTENED_HEAD = 48;

export function shortenDataUrl(_key: string, value: unknown): unknown {
  return typeof value === 'string' && value.startsWith('data:') && value.length > SHORTEN_ABOVE
    ? `${value.slice(0, SHORTENED_HEAD)}… (${String(value.length)} chars)`
    : value;
}
