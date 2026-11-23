import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

import { messageOf } from '@/lib/fault';
import type { EmbeddingRequest, EmbeddingResponse } from '@/llm/embedding-protocol';
import type { EmbeddingModel } from '@/port/embedding-port';

env.allowLocalModels = false;

const onnxWasm = env.backends.onnx.wasm;
if (onnxWasm !== undefined) delete onnxWasm.wasmPaths;

interface Loaded {
  readonly model: EmbeddingModel;
  readonly extractor: Promise<FeatureExtractionPipeline>;
}

let loaded: Loaded | null = null;

const files = new Map<string, { loaded: number; total: number }>();

function reply(message: EmbeddingResponse): void {
  self.postMessage(message);
}

function ratio(): number {
  let done = 0;
  let total = 0;
  for (const file of files.values()) {
    done += file.loaded;
    total += file.total;
  }
  return total <= 0 ? 0 : Math.min(1, done / total);
}

async function load(id: number, model: EmbeddingModel): Promise<Loaded> {
  if (loaded !== null && loaded.model.id === model.id && loaded.model.revision === model.revision) {
    return loaded;
  }
  const previous = loaded;
  loaded = null;
  if (previous !== null) await (await previous.extractor.catch(() => null))?.dispose();
  files.clear();
  const extractor = pipeline('feature-extraction', model.id, {
    ...(model.revision === null ? {} : { revision: model.revision }),
    dtype: model.dtype,
    progress_callback: (info) => {
      if (info.status !== 'progress') return;
      files.set(info.file, { loaded: info.loaded, total: info.total });
      reply({ id, kind: 'progress', ratio: ratio() });
    },
  });
  loaded = { model, extractor };
  return loaded;
}

async function embed(
  current: Loaded,
  texts: readonly string[],
  prefix: string,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await current.extractor;
  const output = await extractor(
    texts.map((text) => prefix + text),
    { pooling: current.model.pooling, normalize: true },
  );
  const [rows = 0, width = 0] = output.dims;
  const data = output.data as Float32Array;
  return Array.from({ length: rows }, (_, row) => data.slice(row * width, (row + 1) * width));
}

async function handle(request: EmbeddingRequest): Promise<void> {
  try {
    if (request.kind === 'load') {
      const current = await load(request.id, request.model);
      const generic = await embed(current, request.model.generic, request.model.queryPrefix);
      reply({ id: request.id, kind: 'loaded', generic });
      return;
    }
    if (loaded === null) throw new Error('model is not loaded');
    const prefix = request.as === 'query' ? loaded.model.queryPrefix : loaded.model.passagePrefix;
    const vectors = await embed(loaded, request.texts, prefix);
    reply({ id: request.id, kind: 'vectors', vectors });
  } catch (error) {
    if (request.kind === 'load') loaded = null;
    reply({ id: request.id, kind: 'error', message: messageOf(error) });
  }
}

self.addEventListener('message', (event: MessageEvent<EmbeddingRequest>) => {
  void handle(event.data);
});
