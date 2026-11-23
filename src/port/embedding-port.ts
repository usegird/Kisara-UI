export type EmbeddingKind = 'query' | 'passage';

export interface EmbeddingModel {
  readonly id: string;
  readonly revision: string | null;
  readonly dtype: 'int8' | 'q8';
  readonly pooling: 'mean' | 'cls';
  readonly queryPrefix: string;
  readonly passagePrefix: string;
  readonly generic: readonly string[];
}

export type EmbeddingLoad =
  | {
      readonly ok: true;
      readonly generic: readonly Float32Array[];
      readonly bytes: number;
    }
  | { readonly ok: false; readonly message: string };

export interface StoredEmbeddingModel {
  readonly id: string;
  readonly bytes: number;
}

export interface EmbeddingPort {
  readonly load: (
    model: EmbeddingModel,
    onProgress: (ratio: number) => void,
  ) => Promise<EmbeddingLoad>;
  readonly embed: (
    texts: readonly string[],
    kind: EmbeddingKind,
  ) => Promise<readonly Float32Array[] | null>;
  readonly unload: () => Promise<void>;
  readonly stored: () => Promise<readonly StoredEmbeddingModel[]>;
  readonly remove: (id: string) => Promise<void>;
}
