// ─────────────────────────────
// 1 行 1 件の JSON（JSON Lines）を gzip で縮めて書く・流れのまま読む。全体を 1 つの文字列にしないので、
// ブラウザが作れる文字列の長さ（約 512 MB）を超えるファイルも扱える（上限は 1 行の長さだけ）。
// 圧縮と展開はブラウザの標準（CompressionStream・DecompressionStream）に任せる。
// ─────────────────────────────

/** 1 行が上限を超えた */
export class LineTooLongError extends Error {}

/** gzip の先頭の 2 バイト */
const GZIP_MAGIC = { first: 0x1f, second: 0x8b } as const;

/** Blob の中身の流れ。gzip なら展開しながら流す（縮めていない物はそのまま） */
async function byteStream(blob: Blob): Promise<ReadableStream<BufferSource>> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  // 展開・文字への変換の受け口は BufferSource で受けるので、流れの型もそれに揃える
  const raw: ReadableStream<BufferSource> = blob.stream();
  const gzip = head[0] === GZIP_MAGIC.first && head[1] === GZIP_MAGIC.second;
  return gzip ? raw.pipeThrough(new DecompressionStream('gzip')) : raw;
}

/**
 * Blob を 1 行ずつ読む（空の行は飛ばす）。`maxChars` を超える行があれば `LineTooLongError` を投げる。
 * 途中でやめると読むのも止める
 */
export async function* readLines(blob: Blob, maxChars: number): AsyncGenerator<string> {
  const reader = (await byteStream(blob)).pipeThrough(new TextDecoderStream()).getReader();
  // 長い行を何度も先頭から探さないよう、改行の無い切れ端は貯めておき、改行が来たらつなぐ
  let parts: string[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let start = 0;
      let at = value.indexOf('\n', start);
      while (at >= 0) {
        parts.push(value.slice(start, at));
        const line = parts.join('');
        parts = [];
        length = 0;
        start = at + 1;
        if (line.length > maxChars) throw new LineTooLongError();
        if (line.trim() !== '') yield line;
        at = value.indexOf('\n', start);
      }
      const tail = value.slice(start);
      if (tail === '') continue;
      parts.push(tail);
      length += tail.length;
      if (length > maxChars) throw new LineTooLongError();
    }
    const last = parts.join('');
    if (last.trim() !== '') yield last;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** 行を 1 つずつ gzip で縮め、1 つの Blob にする（行の末尾に改行を足す） */
export async function gzipLines(
  lines: AsyncIterable<string> | Iterable<string>,
  type: string,
): Promise<Blob> {
  const iterator =
    Symbol.asyncIterator in lines ? lines[Symbol.asyncIterator]() : lines[Symbol.iterator]();
  const encoder = new TextEncoder();
  const source = new ReadableStream<BufferSource>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(encoder.encode(`${next.value}\n`));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  const reader = source.pipeThrough(new CompressionStream('gzip')).getReader();
  // 縮めた後の切れ端だけを持つ（縮める前の全体は持たない）
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Blob(chunks, { type });
}
