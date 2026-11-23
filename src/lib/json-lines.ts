export class LineTooLongError extends Error {}

const GZIP_MAGIC = { first: 0x1f, second: 0x8b } as const;

async function byteStream(blob: Blob): Promise<ReadableStream<BufferSource>> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const raw: ReadableStream<BufferSource> = blob.stream();
  const gzip = head[0] === GZIP_MAGIC.first && head[1] === GZIP_MAGIC.second;
  return gzip ? raw.pipeThrough(new DecompressionStream('gzip')) : raw;
}

export async function* readLines(blob: Blob, maxChars: number): AsyncGenerator<string> {
  const reader = (await byteStream(blob)).pipeThrough(new TextDecoderStream()).getReader();
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
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Blob(chunks, { type });
}
