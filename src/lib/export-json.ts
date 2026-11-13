import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 保存した値を書き出す JSON にする（1 行）と、その読み戻し。Blob とバイト列は JSON に入らないので、
// `{"$blob": data URL}`・`{"$bytes": data URL}` の印にして中身ごと入れ、読み戻すときに元の形へ戻す。
// 物と配列はたどって替える。
// ─────────────────────────────

const BLOB = '$blob';
const BYTES = '$bytes';
/** 一度に文字へ変えるバイト数（関数の引数の数の上限より十分小さい） */
const CHAR_CODE_CHUNK = 0x8000;

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  // 大きなバイト列を一度に文字へ変えると引数の上限を超えるので、区切って変える
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
  // 鍵は外から来た物もあるので、親を差し替えない作り方（Object.fromEntries）でまとめる
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [key, await plain(item, seen)] as const),
  );
  return Object.fromEntries(entries);
}

/** 値を書き出す JSON の文字にする（改行を含まない 1 行。1 行 1 件のファイルの 1 行になる） */
export async function exportJson(value: unknown): Promise<string> {
  return JSON.stringify(await plain(value, new WeakSet()));
}

/** data URL の中身と種類。base64 でなければ null */
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

/** 印 1 つだけを持つ物なら、その印の中身（data URL） */
function markOf(value: Record<string, unknown>, mark: string): string | null {
  const keys = Object.keys(value);
  const found = value[mark];
  return keys.length === 1 && typeof found === 'string' ? found : null;
}

/**
 * 書き出した JSON を読んだ値の印を元の形（Blob・バイト列）へ戻す。読めない印はそのまま残す
 */
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
