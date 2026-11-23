import { createLlmClient } from '@/llm/client';
import type { LlmPort } from '@/port/llm-port';

export function createHttpLlmPort(): LlmPort {
  return createLlmClient({
    fetch: (input, init) => globalThis.fetch(input, init),
    pageProtocol: () =>
      typeof globalThis.location === 'undefined' ? null : globalThis.location.protocol,
  });
}
