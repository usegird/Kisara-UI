import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

import { messageOf } from '@/lib/fault';
import type { EmbeddingRequest, EmbeddingResponse } from '@/llm/embedding-protocol';
import type { EmbeddingModel } from '@/port/embedding-port';

// ─────────────────────────────
// 近似判定の埋め込みを計算する Web Worker。画面の処理を止めないよう、モデルの読み込みと計算をここで行う。
// モデルは Hugging Face から落とし、ライブラリの既定の Cache Storage に置く。
// ─────────────────────────────

// 手元のフォルダからは読まない（ブラウザでは無い）
env.allowLocalModels = false;

// 実行の部品（ONNX Runtime の WASM と補助の JS）は自分のサイトから読む。
// Transformers.js は読み込んだ時点で取り先を jsDelivr に向けるので、その指定を外す。指定が無いと
// ONNX Runtime は束ねた補助の JS と、ビルドが出力に置いた .wasm を使う
const onnxWasm = env.backends.onnx.wasm;
if (onnxWasm !== undefined) delete onnxWasm.wasmPaths;

interface Loaded {
  readonly model: EmbeddingModel;
  readonly extractor: Promise<FeatureExtractionPipeline>;
}

let loaded: Loaded | null = null;

/** 届いた分のバイト数（ファイルごと）。進み具合をまとめて出す */
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

/** 頼まれたモデルを読む。別のモデルを読んでいれば手放してから読む */
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

/** 文を埋め込み、長さ 1 にそろえた行ごとのベクトルにする */
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
    // 読み込みに失敗したら、次に頼まれたときに読み直す
    if (request.kind === 'load') loaded = null;
    reply({ id: request.id, kind: 'error', message: messageOf(error) });
  }
}

self.addEventListener('message', (event: MessageEvent<EmbeddingRequest>) => {
  void handle(event.data);
});
