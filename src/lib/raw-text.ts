// ─────────────────────────────
// 保存した値を見るための文字にする（字下げした JSON）。Blob・バイト列と長い data URL は中身を出さず、
// 種類と大きさだけの印に替える。長ければ先頭だけを返す。印は記号で、画面の文言ではない。
// ─────────────────────────────

/** data URL をこの長さより長ければ印に替える */
const DATA_URL_LIMIT = 200;

function replaced(value: unknown): unknown {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return `<Blob ${value.type || '?'} ${value.size} B>`;
  }
  if (value instanceof ArrayBuffer) return `<binary ${value.byteLength} B>`;
  if (ArrayBuffer.isView(value)) return `<binary ${value.byteLength} B>`;
  if (typeof value === 'string' && value.startsWith('data:') && value.length > DATA_URL_LIMIT) {
    return `<${value.slice(0, value.indexOf(',') + 1)}… ${value.length} chars>`;
  }
  return value;
}

/** 見るための文字と、先頭だけに切ったか */
export interface RawText {
  readonly text: string;
  /** 長いので先頭だけにしたか */
  readonly truncated: boolean;
}

/** 値を字下げした JSON の文字にする。`limit` 文字より長ければ先頭だけ */
export function rawText(value: unknown, limit: number): RawText {
  // 文字の値は JSON の引用符を付けずにそのまま出す
  const full =
    typeof value === 'string'
      ? value
      : (JSON.stringify(value, (_key, item: unknown) => replaced(item), 2) ?? String(value));
  return full.length > limit
    ? { text: full.slice(0, limit), truncated: true }
    : { text: full, truncated: false };
}
