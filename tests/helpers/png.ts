const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

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

export function textChunk(keyword: string, text: string): number[] {
  const encoder = new TextEncoder();
  return chunk('tEXt', [...encoder.encode(keyword), 0, ...encoder.encode(text)]);
}

export function png(...chunks: number[][]): ArrayBuffer {
  return new Uint8Array([...SIGNATURE, ...chunks.flat(), ...chunk('IEND', [])]).buffer;
}

export function pngWithPrompt(json: string): ArrayBuffer {
  return png(textChunk('prompt', json));
}
