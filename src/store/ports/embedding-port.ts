import type { EmbeddingPort } from '@/port/embedding-port';
import { guardEmbeddingPort } from '@/store/ports/network-consent';

// ─────────────────────────────
// 近似判定の窓口の受け口（形は llm-port.ts と同じ）。入口が実装を 1 つ入れる。
// ─────────────────────────────

let current: EmbeddingPort | null = null;

/**
 * 入口から呼ぶ。後から入れたものが勝つ。機能を有効にするまでモデルを落とさない関門で包む
 */
export function installEmbeddingPort(port: EmbeddingPort): void {
  current = guardEmbeddingPort(port);
}

/** 入っている窓口。入口より先に呼ばれたら、入れ忘れとして投げる */
export function embeddingPort(): EmbeddingPort {
  if (current === null) {
    throw new Error('EmbeddingPort is not installed (call installEmbeddingPort first)');
  }
  return current;
}
