import type {
  EmbeddingKind,
  EmbeddingLoad,
  EmbeddingPort,
  StoredEmbeddingModel,
} from '@/port/embedding-port';

const WORDS = ['treasure', 'gate', 'dragon'] as const;

function vectorOf(text: string): Float32Array {
  const lower = text.toLowerCase();
  const values = WORDS.map((word) => (lower.includes(word) ? 1 : 0.1));
  const length = Math.hypot(...values);
  return Float32Array.from(values.map((value) => value / length));
}

export interface FakeEmbeddingPort extends EmbeddingPort {
  readonly embedded: { readonly texts: readonly string[]; readonly kind: EmbeddingKind }[];
  readonly unloaded: () => number;
  readonly removed: readonly string[];
}

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
