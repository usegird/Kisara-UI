import type { EmbeddingKind, EmbeddingModel } from '@/port/embedding-port';

// ─────────────────────────────
// 近似判定の Web Worker とのやり取りの形。頼みごとに番号を付け、答えを番号で受ける
// ─────────────────────────────

/** 頼みごとの中身（番号を除く） */
export type EmbeddingRequestBody =
  | { readonly kind: 'load'; readonly model: EmbeddingModel }
  | { readonly kind: 'embed'; readonly texts: readonly string[]; readonly as: EmbeddingKind };

/** Web Worker へ送る頼みごと（番号付き） */
export type EmbeddingRequest = EmbeddingRequestBody & { readonly id: number };

/** Web Worker からの答え。頼みごとの番号で対応を取る */
export type EmbeddingResponse =
  | { readonly id: number; readonly kind: 'progress'; readonly ratio: number }
  | { readonly id: number; readonly kind: 'loaded'; readonly generic: readonly Float32Array[] }
  | { readonly id: number; readonly kind: 'vectors'; readonly vectors: readonly Float32Array[] }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };
