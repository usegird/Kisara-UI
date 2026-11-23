import * as web from 'node:stream/web';

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
