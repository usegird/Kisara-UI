import type { ChatCompletionRequest, LlmPort } from '@/port/llm-port';
import { useReceivedStore } from '@/store/use-received-store';
import { useSentRequestsStore } from '@/store/use-sent-requests-store';

const keys = new WeakMap<ChatCompletionRequest, string>();

export function tagSentRequest(request: ChatCompletionRequest, key: string): void {
  keys.set(request, key);
}

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
