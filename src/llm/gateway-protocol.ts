import { isRecord } from '@/lib/guards';
import type {
  ChatCompletionRequest,
  ChatStreamEvent,
  LlmKeyOutcome,
  LlmResult,
} from '@/port/llm-port';

// ─────────────────────────────
// 本体・ゲートウェイの iframe・入力の窓の間で送る知らせの形と読み取り。受け取った値は `unknown` で受けて
// ここで確かめる（ゲートウェイから見ると本体は信頼できない送り元）。
// ─────────────────────────────

/** 本体が iframe の窓へ送る、つなぐ知らせ（MessageChannel の片方を添える） */
export const CONNECT_TYPE = 'kisara-gateway:connect';

/** 入力の窓が iframe の窓へ送る、キーの知らせ */
export const KEY_TYPE = 'kisara-gateway:key';

/** iframe の窓が入力の窓へ返す、キーを確かめた結果の知らせ */
export const VERIFIED_TYPE = 'kisara-gateway:verified';

/** ゲートウェイが受ける要求の種類（LLM の窓口と同じ 3 つ） */
export type GatewayOperation = 'listModels' | 'checkKey' | 'streamChat';

const KEY_OUTCOMES: readonly LlmKeyOutcome[] = ['ok', 'auth', 'failed'];

/** 本体からゲートウェイへ（MessageChannel） */
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
      /** 受け取った本文をそのまま返すか */
      readonly raw: boolean;
    }
  | { readonly type: 'abort'; readonly id: number }
  /** 入ったキーを確かめた結果。ゲートウェイはそのキーを送った入力の窓へ返す */
  | { readonly type: 'verified'; readonly baseUrl: string; readonly outcome: LlmKeyOutcome }
  /**
   * そのベース URL のキーを外す
   */
  | { readonly type: 'forget'; readonly baseUrl: string };

/** ゲートウェイから本体へ（MessageChannel） */
export type GatewayMessage =
  | { readonly type: 'keys'; readonly urls: readonly string[] }
  /** 入力の窓からキーが入った（同じキーを入れ直したときも来る）。本体はこれを受けて確かめる */
  | { readonly type: 'keySet'; readonly url: string }
  | { readonly type: 'event'; readonly id: number; readonly event: ChatStreamEvent }
  | { readonly type: 'raw'; readonly id: number; readonly text: string }
  | { readonly type: 'result'; readonly id: number; readonly result: LlmResult<unknown> };

/** 入力の窓からゲートウェイへ */
export interface KeyMessage {
  readonly type: typeof KEY_TYPE;
  readonly baseUrl: string;
  readonly key: string;
}

/** 窓の `frames` の形（別のオリジンの窓でも数と中の窓は読める） */
interface FrameList {
  readonly length: number;
  readonly [index: number]: { readonly postMessage: (message: unknown, origin: string) => void };
}

/**
 * 入力の窓から、開いた本体の窓の中にあるゲートウェイの iframe へキーを渡す。送り先のオリジンをゲートウェイに
 * 限るので、本体の窓や別のオリジンの iframe には届かない。開いた窓が無ければ false
 */
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

/** 本体がつなぐ知らせか */
export function isConnectMessage(value: unknown): boolean {
  return isRecord(value) && value.type === CONNECT_TYPE;
}

/** 入力の窓のキーの知らせを読む。形が合わなければ null */
export function parseKeyMessage(value: unknown): KeyMessage | null {
  if (!isRecord(value) || value.type !== KEY_TYPE) return null;
  const { baseUrl, key } = value;
  if (typeof baseUrl !== 'string' || typeof key !== 'string' || key.length === 0) return null;
  return { type: KEY_TYPE, baseUrl, key };
}

/** 確かめた結果の知らせ（ゲートウェイから入力の窓へ）を読む。形が合わなければ null */
export function parseVerifiedMessage(value: unknown): LlmKeyOutcome | null {
  if (!isRecord(value) || value.type !== VERIFIED_TYPE) return null;
  return keyOutcomeOf(value.outcome);
}

/** 本体からの知らせを読む。形が合わなければ null（黙って捨てる） */
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

/** ゲートウェイからの知らせを読む。形が合わなければ null */
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
  // 出来事と結果は、ゲートウェイが本体と同じ読み取り（schema）で作ったもの。この通り道は本体とゲートウェイだけが持つ
  // MessageChannel なので、入れ物の形だけを確かめる
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

/**
 * 生成の本体。ゲートウェイは中身を読まずにそのまま利用者の接続先へ送るので、送れる形かだけを確かめる
 * （モデル名と発言の並びがあり、ストリーミングで受けること）
 */
function parseChatRequest(value: unknown): ChatCompletionRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.model !== 'string' || !Array.isArray(value.messages)) return null;
  if (value.stream !== true) return null;
  return value as unknown as ChatCompletionRequest;
}
