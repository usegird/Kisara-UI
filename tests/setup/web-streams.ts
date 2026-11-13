import * as web from 'node:stream/web';

// jsdom の文脈には流れ（ReadableStream など）と圧縮・展開（CompressionStream・DecompressionStream）が無く、
// jsdom の Blob には `stream()` が無い。ブラウザには標準であるので、画面を描くテストにだけ Node の物を入れる
// （ストレージの管理の書き出しを 1 行ずつ gzip で読み書きする。src/lib/json-lines.ts）

if (typeof document !== 'undefined') {
  const streams = {
    ReadableStream: web.ReadableStream,
    WritableStream: web.WritableStream,
    TransformStream: web.TransformStream,
    TextDecoderStream: web.TextDecoderStream,
    TextEncoderStream: web.TextEncoderStream,
    CompressionStream: web.CompressionStream,
    DecompressionStream: web.DecompressionStream,
  };
  for (const [name, value] of Object.entries(streams)) {
    if (!(name in globalThis)) {
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
  }
  if (typeof Blob.prototype.stream !== 'function') {
    Object.defineProperty(Blob.prototype, 'stream', {
      configurable: true,
      writable: true,
      value(this: Blob): ReadableStream<Uint8Array> {
        const bytes = this.arrayBuffer();
        return new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(new Uint8Array(await bytes));
            controller.close();
          },
        });
      },
    });
  }
}
