const SHORT_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_ID_LENGTH = 8;

export function newShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => SHORT_ID_CHARS[byte % SHORT_ID_CHARS.length]).join('');
}
