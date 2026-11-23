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

const KEYS_STORAGE_NAME = 'kisaraui.gateway.keys';

interface MessageTarget {
  readonly addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  readonly parent: unknown;
}

interface EntryWindow {
  readonly postMessage: (message: unknown, targetOrigin: string) => void;
}

interface GatewayFrameOptions {
  readonly appOrigin: string;
  readonly gatewayOrigin: string;
  readonly target: MessageTarget;
  readonly createClient: (keyOf: (base: string) => string) => LlmPort;
  readonly storage: KeyStorage;
}

interface KeyStorage {
  readonly getItem: (name: string) => unknown;
  readonly setItem: (name: string, value: string) => void;
}

export function serveGateway(options: GatewayFrameOptions): void {
  const keys = loadKeys(options.storage);
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
      const base = normalizeLlmBaseUrl(message.baseUrl);
      if (base === null || !keys.delete(base)) return;
      entries.delete(base);
      saveKeys();
      sendKeys();
      return;
    }
    if (message.type === 'verified') {
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
    sendKeys();
    send({ type: 'keySet', url: base });
  });
}

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
