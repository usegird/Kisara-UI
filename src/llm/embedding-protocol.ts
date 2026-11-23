import type { EmbeddingKind, EmbeddingModel } from '@/port/embedding-port';

export type EmbeddingRequestBody =
  | { readonly kind: 'load'; readonly model: EmbeddingModel }
  | { readonly kind: 'embed'; readonly texts: readonly string[]; readonly as: EmbeddingKind };

export type EmbeddingRequest = EmbeddingRequestBody & { readonly id: number };

export type EmbeddingResponse =
  | { readonly id: number; readonly kind: 'progress'; readonly ratio: number }
  | { readonly id: number; readonly kind: 'loaded'; readonly generic: readonly Float32Array[] }
  | { readonly id: number; readonly kind: 'vectors'; readonly vectors: readonly Float32Array[] }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };
