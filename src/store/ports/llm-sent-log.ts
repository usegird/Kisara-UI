import type { ChatCompletionRequest, LlmPort } from '@/port/llm-port';
import { useReceivedStore } from '@/store/use-received-store';
import { useSentRequestsStore } from '@/store/use-sent-requests-store';

// ─────────────────────────────
// LLM の窓口を、送った要求の本文と受け取った本文の記録で包む。
// 関門と歯止めの内側に置き、断った要求は記録しない。本文は窓口が送るものと同じ形にする（client.ts）。
// 会話は送る前に要求へ候補の鍵を添え（`tagSentRequest`）、鍵の無い要求（要約・構成の相談など）は記録しない
// ─────────────────────────────

const keys = new WeakMap<ChatCompletionRequest, string>();

/** 送る要求に、受け取る会話の候補の鍵（`responseKey`）を添える */
export function tagSentRequest(request: ChatCompletionRequest, key: string): void {
  keys.set(request, key);
}

/** LLM の窓口を、鍵を添えた要求の送った本文と受け取った本文を記録する窓口で包む */
export function recordSentLlmPort(port: LlmPort): LlmPort {
  return {
    listModels: (endpoint, signal) => port.listModels(endpoint, signal),
    checkKey: (endpoint, signal) => port.checkKey(endpoint, signal),
    streamChat: async (endpoint, request, { onEvent, signal }) => {
      const key = keys.get(request);
      if (key === undefined) return port.streamChat(endpoint, request, { onEvent, signal });
      useSentRequestsStore
        .getState()
        .add(key, { at: Date.now(), model: request.model, body: JSON.stringify(request) });
      // 受け取った本文は受け取り終えてから 1 度だけ書く（届くたびに書くと、アイコンが描き直される）
      const lines: string[] = [];
      try {
        return await port.streamChat(endpoint, request, {
          onEvent,
          signal,
          onRaw: (text) => {
            lines.push(text);
          },
        });
      } finally {
        if (lines.length > 0) useReceivedStore.getState().add(key, lines.join('\n'), Date.now());
      }
    },
  };
}
