import { isRecord } from '@/lib/guards';
import { fail } from '@/llm/client-receive';
import { normalizeLlmBaseUrl } from '@/llm/endpoints';
import {
  isConnectMessage,
  parseHostMessage,
  parseKeyMessage,
  VERIFIED_TYPE,
  type GatewayMessage,
  type HostMessage,
} from '@/llm/gateway-protocol';
import type { LlmPort, LlmResult } from '@/port/llm-port';

// ─────────────────────────────
// ゲートウェイの側。入力の窓からキーを受けてタブごとの保存領域に持ち、本体の要求にキーを付けて送る。
// 本体は信頼できない送り元として扱い、キーを入れた接続先への決まった 3 つの要求だけを受ける。
// ─────────────────────────────

/** キーの置き場の名前（ベース URL → キーの JSON） */
const KEYS_STORAGE_NAME = 'kisaraui.gateway.keys';

/** 知らせを受ける窓（iframe の `window`） */
interface MessageTarget {
  readonly addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  /** 埋め込んだ親の窓。本体のつなぐ知らせはここからだけ受ける */
  readonly parent: unknown;
}

/** キーを送ってきた入力の窓（確かめた結果を返す先） */
interface EntryWindow {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
}

/** ゲートウェイの側を始めるときに渡すもの */
interface GatewayFrameOptions {
  /** 要求を受けてよい本体のオリジン */
  readonly appOrigin: string;
  /** ゲートウェイ自身のオリジン（入力の窓のキーの知らせはここからだけ受ける） */
  readonly gatewayOrigin: string;
  readonly target: MessageTarget;
  /** キーを引く関数で、キーを付けて送る LLM の窓口を作る */
  readonly createClient: (keyOf: (base: string) => string) => LlmPort;
  /** キーの置き場（ゲートウェイのオリジンのタブごとの保存領域） */
  readonly storage: KeyStorage;
}

/** キーの置き場。読めない・書けない置き場でも落ちないもの */
interface KeyStorage {
  readonly getItem: (name: string) => unknown;
  readonly setItem: (name: string, value: string) => void;
}

/** ゲートウェイの側を始める。本体とつながるのは最初の 1 回だけ */
export function serveGateway(options: GatewayFrameOptions): void {
  // 同じタブで読み込み直したら、前に入れたキーを戻す
  const keys = loadKeys(options.storage);
  // 確かめた結果を待っている入力の窓。同じ先へ入れ直したら新しい窓へ返す
  const entries = new Map<string, EntryWindow>();
  const running = new Map<number, AbortController>();
  const client = options.createClient((base) => keys.get(base) ?? '');
  let host: MessagePort | null = null;

  const send = (message: GatewayMessage): void => host?.postMessage(message);
  const sendKeys = (): void => send({ type: 'keys', urls: [...keys.keys()] });
  const saveKeys = (): void =>
    options.storage.setItem(KEYS_STORAGE_NAME, JSON.stringify(Object.fromEntries(keys)));

  const onHostMessage = (data: unknown): void => {
    const message = parseHostMessage(data);
    if (message === null) return;
    if (message.type === 'abort') {
      running.get(message.id)?.abort();
      return;
    }
    if (message.type === 'forget') {
      // 本体が求めても、できるのはキーを使えなくすることだけ（キーは渡さない）
      const base = normalizeLlmBaseUrl(message.baseUrl);
      if (base === null || !keys.delete(base)) return;
      entries.delete(base);
      saveKeys();
      sendKeys();
      return;
    }
    if (message.type === 'verified') {
      // 返す先はキーを送ってきた窓だけ。本体が結果を偽っても、窓の表示が変わるだけでキーは出ない
      const base = normalizeLlmBaseUrl(message.baseUrl);
      const entry = base === null ? undefined : entries.get(base);
      if (base === null || entry === undefined) return;
      entries.delete(base);
      entry.postMessage({ type: VERIFIED_TYPE, outcome: message.outcome }, options.gatewayOrigin);
      return;
    }
    void serveRequest(message);
  };

  const serveRequest = async (message: Extract<HostMessage, { type: 'request' }>) => {
    const { id } = message;
    const base = normalizeLlmBaseUrl(message.baseUrl);
    // キーを付けるのは入れたときのベース URL だけ。ほかの先へは送らない（本体が直に送る）
    if (base === null || !keys.has(base)) {
      send({ type: 'result', id, result: fail('auth') });
      return;
    }
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const result = await runOperation(client, message, controller.signal, send);
      send({ type: 'result', id, result });
    } finally {
      running.delete(id);
    }
  };

  options.target.addEventListener('message', (event) => {
    if (event.origin === options.appOrigin && event.source === options.target.parent) {
      const [port] = event.ports;
      if (host !== null || port === undefined || !isConnectMessage(event.data)) return;
      host = port;
      host.onmessage = (message) => onHostMessage(message.data);
      sendKeys();
      return;
    }
    if (event.origin !== options.gatewayOrigin) return;
    const key = parseKeyMessage(event.data);
    const base = key === null ? null : normalizeLlmBaseUrl(key.baseUrl);
    if (key === null || base === null) return;
    keys.set(base, key.key);
    saveKeys();
    if (isEntryWindow(event.source)) entries.set(base, event.source);
    // 本体がキーのある先を知ってから確かめるよう、一覧を先に送る
    sendKeys();
    send({ type: 'keySet', url: base });
  });
}

/** 置き場からキーを読む。形の合わない項目は捨てる */
function loadKeys(storage: KeyStorage): Map<string, string> {
  const keys = new Map<string, string>();
  const text = storage.getItem(KEYS_STORAGE_NAME);
  if (typeof text !== 'string') return keys;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return keys;
  }
  if (!isRecord(stored)) return keys;
  for (const [url, key] of Object.entries(stored)) {
    const base = normalizeLlmBaseUrl(url);
    if (base !== null && typeof key === 'string' && key.length > 0) keys.set(base, key);
  }
  return keys;
}

function isEntryWindow(value: unknown): value is EntryWindow {
  return typeof value === 'object' && value !== null && 'postMessage' in value;
}

/** 1 つの要求を LLM の窓口で送る。生成は届いたものを順に本体へ流す */
function runOperation(
  client: LlmPort,
  message: Extract<HostMessage, { type: 'request' }>,
  signal: AbortSignal,
  send: (message: GatewayMessage) => void,
): Promise<LlmResult<unknown>> {
  const { id } = message;
  const endpoint = { baseUrl: message.baseUrl };
  if (message.op !== 'streamChat') {
    return message.op === 'listModels'
      ? client.listModels(endpoint, signal)
      : client.checkKey(endpoint, signal);
  }
  return client.streamChat(endpoint, message.request, {
    onEvent: (event) => send({ type: 'event', id, event }),
    signal,
    onRaw: message.raw ? (text) => send({ type: 'raw', id, text }) : undefined,
  });
}
