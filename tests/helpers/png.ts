// ─────────────────────────────
// PNG の組み立て。ComfyUI は実行した API Prompt を `tEXt(prompt)` に埋める。
// 読み取り側は CRC を見ないので 0 で埋める。
// ─────────────────────────────

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** 長さ + 種別 + 中身 + CRC（0 埋め） */
export function chunk(type: string, body: number[]): number[] {
  const length = [
    (body.length >>> 24) & 0xff,
    (body.length >>> 16) & 0xff,
    (body.length >>> 8) & 0xff,
    body.length & 0xff,
  ];
  const name = [...type].map((character) => character.charCodeAt(0));

  return [...length, ...name, ...body, 0, 0, 0, 0];
}

/** `tEXt` チャンク（キーワード + NUL + 本文） */
export function textChunk(keyword: string, text: string): number[] {
  const encoder = new TextEncoder();
  return chunk('tEXt', [...encoder.encode(keyword), 0, ...encoder.encode(text)]);
}

/** 署名と `IEND` で挟んだ PNG */
export function png(...chunks: number[][]): ArrayBuffer {
  return new Uint8Array([...SIGNATURE, ...chunks.flat(), ...chunk('IEND', [])]).buffer;
}

/** ComfyUI が出す生成画像と同じ形（`tEXt(prompt)` に API Prompt） */
export function pngWithPrompt(json: string): ArrayBuffer {
  return png(textChunk('prompt', json));
}
