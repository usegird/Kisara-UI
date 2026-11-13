import type {
  EmbeddingKind,
  EmbeddingLoad,
  EmbeddingPort,
  StoredEmbeddingModel,
} from '@/port/embedding-port';

// ─────────────────────────────
// 作り物の近似判定の窓口。決めた語を含むかで次元を立て、長さ 1 にそろえる。
// どの語も含まない文（ありふれた発言）は、どの次元にも少しずつ寄る
// ─────────────────────────────

const WORDS = ['treasure', 'gate', 'dragon'] as const;

function vectorOf(text: string): Float32Array {
  const lower = text.toLowerCase();
  const values = WORDS.map((word) => (lower.includes(word) ? 1 : 0.1));
  const length = Math.hypot(...values);
  return Float32Array.from(values.map((value) => value / length));
}

export interface FakeEmbeddingPort extends EmbeddingPort {
  /** 埋め込んだ文（種類ごと） */
  readonly embedded: { readonly texts: readonly string[]; readonly kind: EmbeddingKind }[];
  /** メモリから降ろした回数 */
  readonly unloaded: () => number;
  /** 消したモデルの id */
  readonly removed: readonly string[];
}

/** `stored` は初めからこのブラウザに置いてあるモデル。読めたモデルも加わる */
export function fakeEmbeddingPort(
  load: EmbeddingLoad | null = null,
  stored: readonly StoredEmbeddingModel[] = [],
): FakeEmbeddingPort {
  const embedded: { texts: readonly string[]; kind: EmbeddingKind }[] = [];
  const removed: string[] = [];
  let models = [...stored];
  let unloads = 0;
  return {
    embedded,
    removed,
    unloaded: () => unloads,
    load: (model, onProgress) => {
      onProgress(0.5);
      const result = load ?? {
        ok: true,
        generic: [vectorOf('hello')],
        bytes: 44 * 1024 * 1024,
      };
      if (result.ok && !models.some((entry) => entry.id === model.id)) {
        models = [...models, { id: model.id, bytes: result.bytes }];
      }
      return Promise.resolve(result);
    },
    embed: (texts, kind) => {
      embedded.push({ texts, kind });
      return Promise.resolve(texts.map(vectorOf));
    },
    unload: () => {
      unloads += 1;
      return Promise.resolve();
    },
    stored: () => Promise.resolve(models),
    remove: (id) => {
      removed.push(id);
      models = models.filter((entry) => entry.id !== id);
      return Promise.resolve();
    },
  };
}
