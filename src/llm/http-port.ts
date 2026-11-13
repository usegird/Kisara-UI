import { createLlmClient } from '@/llm/client';
import type { LlmPort } from '@/port/llm-port';

// ─────────────────────────────
// LLM の窓口の HTTP 実装。入口が作って受け口に入れる。
// ─────────────────────────────

/** ブラウザの `fetch` と、開いているページの経路で LLM の窓口を作る */
export function createHttpLlmPort(): LlmPort {
  return createLlmClient({
    fetch: (input, init) => globalThis.fetch(input, init),
    pageProtocol: () =>
      typeof globalThis.location === 'undefined' ? null : globalThis.location.protocol,
  });
}
