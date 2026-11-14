import { fail } from '@/llm/client-receive';
import { normalizeLlmBaseUrl } from '@/llm/endpoints';
import { GATEWAY_ENTRY_PATH, GATEWAY_FRAME_PATH } from '@/llm/gateway-origins';
import {
  CONNECT_TYPE,
  parseGatewayMessage,
  type GatewayMessage,
  type HostMessage,
} from '@/llm/gateway-protocol';
import type { ChatStreamEvent, LlmEndpoint, LlmKeyPort, LlmPort, LlmResult } from '@/port/llm-port';

// ─────────────────────────────
// 本体の側。ゲートウェイの iframe を置いてつなぎ、ゲートウェイがキーを持つ接続先への要求をゲートウェイへ回す。
// ほかの接続先へは本体から直に送る。キーそのものは受け取らない。
// ─────────────────────────────

/** 入力の窓の大きさ（ベース URL とキーの 2 つの欄が収まる） */
const ENTRY_FEATURES = 'popup,width=520,height=560';

/** 本体の側を作るときに渡すもの */
interface GatewayHostOptions {
  readonly gatewayOrigin: string;
  /** キーの無い接続先へ直に送る窓口 */
  readonly direct: LlmPort;
  /** iframe を置く文書 */
  readonly document: Document;
  /** 入力の窓を開く（`window.open`） */
  readonly open: (url: string, target: string, features: string) => unknown;
  /** 入力の窓に渡す画面の言語 */
  readonly locale: () => string;
}

/** 本体の側の窓口。LLM の窓口と、ゲートウェイの窓口 */
export interface GatewayHost {
  readonly llm: LlmPort;
  readonly keys: LlmKeyPort;
}

/** 番号を付ける前の要求（要求の種類ごとに形を保つ） */
type UnsentRequest =
  Extract<HostMessage, { type: 'request' }> extends infer M
    ? M extends unknown
      ? Omit<M, 'id'>
      : never
    : never;

/** ゲートウェイから聞いたキーのある先と、その知らせの購読者 */
interface KeyBook {
  keyed: readonly string[];
  ready: boolean;
  /** キーのある先が変わった・つながった */
  readonly changed: Set<() => void>;
  /** 入力の窓からキーが入った */
  readonly keySet: Set<(baseUrl: string) => void>;
}

/** ゲートウェイからの返事を待っている 1 つの要求 */
interface Pending {
  readonly resolve: (result: LlmResult<unknown>) => void;
  readonly onEvent?: ((event: ChatStreamEvent) => void) | undefined;
  readonly onRaw?: ((text: string) => void) | undefined;
}

/** ゲートウェイの iframe を置き、本体の側の窓口を作る */
export function createGatewayHost(options: GatewayHostOptions): GatewayHost {
  const { gatewayOrigin, direct } = options;
  const book: KeyBook = { keyed: [], ready: false, changed: new Set(), keySet: new Set() };
  const pending = new Map<number, Pending>();
  let host: MessagePort | null = null;
  let nextId = 1;

  const onGatewayMessage = (data: unknown): void => {
    const message = parseGatewayMessage(data);
    if (message === null) return;
    if (message.type === 'keys') {
      book.keyed = message.urls;
      // ゲートウェイがキーの一覧を返したら、つながったとする（読み込めなかった iframe は返さない）
      book.ready = true;
      for (const listener of book.changed) listener();
      return;
    }
    if (message.type === 'keySet') {
      for (const listener of book.keySet) listener(message.url);
      return;
    }
    deliver(pending, message);
  };

  const frame = createFrame(options.document, `${gatewayOrigin}${GATEWAY_FRAME_PATH}`);
  frame.addEventListener('load', () => {
    if (host !== null) return;
    const channel = new MessageChannel();
    host = channel.port1;
    host.onmessage = (event) => onGatewayMessage(event.data);
    frame.contentWindow?.postMessage({ type: CONNECT_TYPE }, gatewayOrigin, [channel.port2]);
  });
  options.document.body.append(frame);

  const hasKey = (endpoint: LlmEndpoint): boolean => {
    const base = normalizeLlmBaseUrl(endpoint.baseUrl);
    return base !== null && book.keyed.includes(base);
  };

  const request = <T>(
    message: UnsentRequest,
    signal: AbortSignal | undefined,
    receiver: Omit<Pending, 'resolve'> = {},
  ): Promise<LlmResult<T>> => {
    const port = host;
    if (port === null) return Promise.resolve(fail('unreachable'));
    const id = nextId++;
    return new Promise((resolve) => {
      // ゲートウェイは要求の種類ごとに決まった形の値を返す（本体と同じ LLM の窓口が作る）
      pending.set(id, { ...receiver, resolve: resolve as (result: LlmResult<unknown>) => void });
      port.postMessage({ ...message, id });
      signal?.addEventListener('abort', () => port.postMessage({ type: 'abort', id }), {
        once: true,
      });
    });
  };

  const llm: LlmPort = {
    listModels: (endpoint, signal) =>
      hasKey(endpoint)
        ? request({ type: 'request', op: 'listModels', baseUrl: endpoint.baseUrl }, signal)
        : direct.listModels(endpoint, signal),
    checkKey: (endpoint, signal) =>
      hasKey(endpoint)
        ? request({ type: 'request', op: 'checkKey', baseUrl: endpoint.baseUrl }, signal)
        : direct.checkKey(endpoint, signal),
    streamChat: (endpoint, chat, receiver) => {
      if (!hasKey(endpoint)) return direct.streamChat(endpoint, chat, receiver);
      const raw = receiver.onRaw !== undefined;
      const message = { type: 'request', op: 'streamChat', baseUrl: endpoint.baseUrl } as const;
      return request({ ...message, request: chat, raw }, receiver.signal, receiver);
    },
  };

  const keys = createKeyPort(book, options, (message) => host?.postMessage(message));
  return { llm, keys };
}

/** ゲートウェイの窓口。キーのある先を返し、入力の窓を開き、確かめた結果をゲートウェイへ返す */
function createKeyPort(
  book: KeyBook,
  options: GatewayHostOptions,
  post: (message: HostMessage) => void,
): LlmKeyPort {
  return {
    keyedUrls: () => book.keyed,
    subscribe: (listener) => {
      book.changed.add(listener);
      return () => book.changed.delete(listener);
    },
    openEntry: (baseUrl) => {
      if (!book.ready) return 'unready';
      const params = new URLSearchParams({ base: baseUrl.trim(), lang: options.locale() });
      // 名前を付けない（同じ名前の窓は別のタブから開いても開いた元が替わらず、キーが元のタブへ渡る）
      const url = `${options.gatewayOrigin}${GATEWAY_ENTRY_PATH}#${params.toString()}`;
      return options.open(url, '_blank', ENTRY_FEATURES) === null ? 'blocked' : 'opened';
    },
    onKeySet: (listener) => {
      book.keySet.add(listener);
      return () => book.keySet.delete(listener);
    },
    reportVerified: (baseUrl, outcome) => post({ type: 'verified', baseUrl, outcome }),
    forgetKey: (baseUrl) => post({ type: 'forget', baseUrl }),
  };
}

/** 見えないゲートウェイの iframe。読み上げにも Tab にも出さない */
function createFrame(document: Document, src: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.src = src;
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  return frame;
}

/** ゲートウェイの返事を、待っている要求へ渡す。結果が来たら待つのをやめる */
function deliver(
  pending: Map<number, Pending>,
  message: Exclude<GatewayMessage, { type: 'keys' | 'keySet' }>,
) {
  const waiting = pending.get(message.id);
  if (waiting === undefined) return;
  if (message.type === 'event') waiting.onEvent?.(message.event);
  else if (message.type === 'raw') waiting.onRaw?.(message.text);
  else {
    pending.delete(message.id);
    waiting.resolve(message.result);
  }
}
