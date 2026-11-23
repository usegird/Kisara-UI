import { isRecord } from '@/lib/guards';
import type {
  ChatCompletionRequest,
  ChatStreamEvent,
  LlmKeyOutcome,
  LlmResult,
} from '@/port/llm-port';

export const CONNECT_TYPE = 'kisara-gateway:connect';

export const KEY_TYPE = 'kisara-gateway:key';

export const VERIFIED_TYPE = 'kisara-gateway:verified';

export type GatewayOperation = 'listModels' | 'checkKey' | 'streamChat';

const KEY_OUTCOMES: readonly LlmKeyOutcome[] = ['ok', 'auth', 'failed'];

export type HostMessage =
  | {
      readonly type: 'request';
      readonly id: number;
      readonly op: 'listModels' | 'checkKey';
      readonly baseUrl: string;
    }
  | {
      readonly type: 'request';
      readonly id: number;
      readonly op: 'streamChat';
      readonly baseUrl: string;
      readonly request: ChatCompletionRequest;
      readonly raw: boolean;
    }
  | { readonly type: 'abort'; readonly id: number }
  | { readonly type: 'verified'; readonly baseUrl: string; readonly outcome: LlmKeyOutcome }
  | { readonly type: 'forget'; readonly baseUrl: string };

export type GatewayMessage =
  | { readonly type: 'keys'; readonly urls: readonly string[] }
  | { readonly type: 'keySet'; readonly url: string }
  | { readonly type: 'event'; readonly id: number; readonly event: ChatStreamEvent }
  | { readonly type: 'raw'; readonly id: number; readonly text: string }
  | { readonly type: 'result'; readonly id: number; readonly result: LlmResult<unknown> };

export interface KeyMessage {
  readonly type: typeof KEY_TYPE;
  readonly baseUrl: string;
  readonly key: string;
}

interface FrameList {
  readonly length: number;
  readonly [index: number]: { readonly postMessage: (message: unknown, origin: string) => void };
}

export function postKeyToOpener(
  opener: { readonly frames: FrameList } | null,
  message: KeyMessage,
  gatewayOrigin: string,
): boolean {
  if (opener === null) return false;
  const { frames } = opener;
  for (let index = 0; index < frames.length; index += 1) {
    frames[index]?.postMessage(message, gatewayOrigin);
  }
  return true;
}

export function isConnectMessage(value: unknown): boolean {
  return isRecord(value) && value.type === CONNECT_TYPE;
}

export function parseKeyMessage(value: unknown): KeyMessage | null {
  if (!isRecord(value) || value.type !== KEY_TYPE) return null;
  const { baseUrl, key } = value;
  if (typeof baseUrl !== 'string' || typeof key !== 'string' || key.length === 0) return null;
  return { type: KEY_TYPE, baseUrl, key };
}

export function parseVerifiedMessage(value: unknown): LlmKeyOutcome | null {
  if (!isRecord(value) || value.type !== VERIFIED_TYPE) return null;
  return keyOutcomeOf(value.outcome);
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === 'verified') {
    const outcome = keyOutcomeOf(value.outcome);
    if (typeof value.baseUrl !== 'string' || outcome === null) return null;
    return { type: 'verified', baseUrl: value.baseUrl, outcome };
  }
  if (value.type === 'forget') {
    return typeof value.baseUrl === 'string' ? { type: 'forget', baseUrl: value.baseUrl } : null;
  }
  if (typeof value.id !== 'number') return null;
  const { id } = value;
  if (value.type === 'abort') return { type: 'abort', id };
  if (value.type !== 'request' || typeof value.baseUrl !== 'string') return null;
  const { baseUrl } = value;
  if (value.op === 'listModels' || value.op === 'checkKey') {
    return { type: 'request', id, op: value.op, baseUrl };
  }
  if (value.op !== 'streamChat') return null;
  const request = parseChatRequest(value.request);
  if (request === null) return null;
  return { type: 'request', id, op: 'streamChat', baseUrl, request, raw: value.raw === true };
}

export function parseGatewayMessage(value: unknown): GatewayMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === 'keys') {
    const urls = Array.isArray(value.urls) ? value.urls : [];
    return { type: 'keys', urls: urls.filter((url) => typeof url === 'string') };
  }
  if (value.type === 'keySet') {
    return typeof value.url === 'string' ? { type: 'keySet', url: value.url } : null;
  }
  if (typeof value.id !== 'number') return null;
  const { id } = value;
  if (value.type === 'raw' && typeof value.text === 'string') {
    return { type: 'raw', id, text: value.text };
  }
  if (value.type === 'event' && isRecord(value.event) && typeof value.event.kind === 'string') {
    return { type: 'event', id, event: value.event as unknown as ChatStreamEvent };
  }
  if (value.type === 'result' && isRecord(value.result) && typeof value.result.ok === 'boolean') {
    return { type: 'result', id, result: value.result as unknown as LlmResult<unknown> };
  }
  return null;
}

function keyOutcomeOf(value: unknown): LlmKeyOutcome | null {
  return KEY_OUTCOMES.find((outcome) => outcome === value) ?? null;
}

function parseChatRequest(value: unknown): ChatCompletionRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.model !== 'string' || !Array.isArray(value.messages)) return null;
  if (value.stream !== true) return null;
  return value as unknown as ChatCompletionRequest;
}
