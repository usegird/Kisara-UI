import type { EmbeddingPort } from '@/port/embedding-port';
import { guardEmbeddingPort } from '@/store/ports/network-consent';

let current: EmbeddingPort | null = null;

export function installEmbeddingPort(port: EmbeddingPort): void {
  current = guardEmbeddingPort(port);
}

export function embeddingPort(): EmbeddingPort {
  if (current === null) {
    throw new Error('EmbeddingPort is not installed (call installEmbeddingPort first)');
  }
  return current;
}
