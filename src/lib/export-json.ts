import { isRecord } from '@/lib/guards';

const BLOB = '$blob';
const BYTES = '$bytes';
const CHAR_CODE_CHUNK = 0x8000;

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHAR_CODE_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHAR_CODE_CHUNK));
  }
  return btoa(binary);
}

const dataUrl = (type: string, bytes: Uint8Array): string =>
  `data:${type || 'application/octet-stream'};base64,${base64Of(bytes)}`;

async function plain(value: unknown, seen: WeakSet<object>): Promise<unknown> {
  if (typeof value !== 'object' || value === null) return value;
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return { [BLOB]: dataUrl(value.type, new Uint8Array(await value.arrayBuffer())) };
  }
  if (value instanceof ArrayBuffer) return { [BYTES]: dataUrl('', new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [BYTES]: dataUrl('', bytes) };
  }
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return Promise.all(value.map((item) => plain(item, seen)));
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [key, await plain(item, seen)] as const),
  );
  return Object.fromEntries(entries);
}

export async function exportJson(value: unknown): Promise<string> {
  return JSON.stringify(await plain(value, new WeakSet()));
}

function decodeDataUrl(
  url: string,
): { readonly type: string; readonly bytes: Uint8Array<ArrayBuffer> } | null {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(url);
  if (match === null) return null;
  try {
    const binary = atob(match[2] ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { type: match[1] ?? '', bytes };
  } catch {
    return null;
  }
}

function markOf(value: Record<string, unknown>, mark: string): string | null {
  const keys = Object.keys(value);
  const found = value[mark];
  return keys.length === 1 && typeof found === 'string' ? found : null;
}

export function reviveExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveExport);
  if (!isRecord(value)) return value;
  const record = value;
  const blob = markOf(record, BLOB);
  const decodedBlob = blob === null ? null : decodeDataUrl(blob);
  if (decodedBlob !== null) {
    return new Blob([decodedBlob.bytes], { type: decodedBlob.type });
  }
  const bytes = markOf(record, BYTES);
  const decodedBytes = bytes === null ? null : decodeDataUrl(bytes);
  if (decodedBytes !== null) return decodedBytes.bytes;
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, reviveExport(item)]));
}
