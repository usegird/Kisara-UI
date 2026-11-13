import type {
  EmbeddingRequest,
  EmbeddingRequestBody,
  EmbeddingResponse,
} from '@/llm/embedding-protocol';
import type {
  EmbeddingKind,
  EmbeddingLoad,
  EmbeddingModel,
  EmbeddingPort,
  StoredEmbeddingModel,
} from '@/port/embedding-port';

// ─────────────────────────────
// 近似判定の窓口のブラウザ実装。Web Worker は初めて頼まれたときに作る（使わない人の
// 初めの読み込みを増やさない）。入口が作って受け口に入れる
// ─────────────────────────────

/** Transformers.js が落とした物を置く Cache Storage の名前（ライブラリの既定） */
const CACHE = 'transformers-cache';

/** Hugging Face から落としたモデルのファイルの URL の頭 */
const HUB = 'https://huggingface.co/';

/** 置いたファイルの URL からモデルの id（`組織/名前`）を取り出す。モデルのファイルでなければ null */
function modelIdOf(url: string): string | null {
  if (!url.startsWith(HUB)) return null;
  const [owner, name] = url.slice(HUB.length).split('/');
  return owner === undefined || name === undefined ? null : `${owner}/${name}`;
}

/** このブラウザに置いたモデルと、そのファイルの大きさの合計（置いた順）。読めなければ空 */
async function storedModels(): Promise<StoredEmbeddingModel[]> {
  if (typeof caches === 'undefined') return [];
  try {
    const cache = await caches.open(CACHE);
    const totals = new Map<string, number>();
    for (const request of await cache.keys()) {
      const id = modelIdOf(request.url);
      if (id === null) continue;
      const response = await cache.match(request);
      const bytes = Number(response?.headers.get('content-length') ?? 0) || 0;
      totals.set(id, (totals.get(id) ?? 0) + bytes);
    }
    return [...totals].map(([id, bytes]) => ({ id, bytes }));
  } catch {
    return [];
  }
}

/** そのモデルのファイルを消す（実行の部品とほかのモデルは残す） */
async function removeModel(id: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE);
    for (const request of await cache.keys()) {
      if (modelIdOf(request.url) === id) await cache.delete(request);
    }
  } catch {
    // 消せなければそのまま（一覧に残る）
  }
}

/** 読んだモデルのファイルの大きさの合計。読めなければ 0 */
async function bytesOf(model: EmbeddingModel): Promise<number> {
  return (await storedModels()).find((stored) => stored.id === model.id)?.bytes ?? 0;
}

interface Pending {
  readonly onProgress: (ratio: number) => void;
  readonly resolve: (response: EmbeddingResponse) => void;
}

/** Web Worker で埋め込みを計算する、近似判定の窓口を作る */
export function createBrowserEmbeddingPort(): EmbeddingPort {
  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<number, Pending>();

  const workerOf = (): Worker => {
    if (worker !== null) return worker;
    const created = new Worker(new URL('./embedding-worker.ts', import.meta.url), {
      type: 'module',
    });
    created.addEventListener('message', (event: MessageEvent<EmbeddingResponse>) => {
      const response = event.data;
      const waiting = pending.get(response.id);
      if (waiting === undefined) return;
      if (response.kind === 'progress') {
        waiting.onProgress(response.ratio);
        return;
      }
      pending.delete(response.id);
      waiting.resolve(response);
    });
    created.addEventListener('error', (event) => {
      // Worker が読めない・落ちたときは、待っている頼みをすべて失敗で返す
      for (const [id, waiting] of pending) {
        waiting.resolve({ id, kind: 'error', message: event.message || 'worker error' });
      }
      pending.clear();
    });
    worker = created;
    return created;
  };

  const ask = (
    request: EmbeddingRequestBody,
    onProgress: (ratio: number) => void = () => {},
  ): Promise<EmbeddingResponse> => {
    const id = (nextId += 1);
    return new Promise((resolve) => {
      pending.set(id, { onProgress, resolve });
      const message: EmbeddingRequest = { ...request, id };
      workerOf().postMessage(message);
    });
  };

  return {
    load: async (model, onProgress): Promise<EmbeddingLoad> => {
      const response = await ask({ kind: 'load', model }, onProgress);
      if (response.kind === 'loaded') {
        return { ok: true, generic: response.generic, bytes: await bytesOf(model) };
      }
      return { ok: false, message: response.kind === 'error' ? response.message : '' };
    },
    embed: async (texts: readonly string[], as: EmbeddingKind) => {
      const response = await ask({ kind: 'embed', texts, as });
      return response.kind === 'vectors' ? response.vectors : null;
    },
    unload: () => {
      worker?.terminate();
      worker = null;
      for (const [id, waiting] of pending) {
        waiting.resolve({ id, kind: 'error', message: 'unloaded' });
      }
      pending.clear();
      return Promise.resolve();
    },
    stored: storedModels,
    remove: removeModel,
  };
}
