import { isRecord } from '@/lib/guards';
import { traceEnabled, traceEvent, type TraceDetail } from '@/lib/trace';
import type { ComfyPort, EventOptions } from '@/port/comfy-port';
import type { LlmPort, LlmResult } from '@/port/llm-port';
import { ConsentRequiredError } from '@/store/ports/network-consent';

// ─────────────────────────────
// 通信の窓口を包み、要求の結果を診断のログの出来事にする。
// 残すのは経路の名前（窓口の関数の名前）・成否・番号・失敗の種類・所要時間だけ。**URL と本文は残さない。**
// 段階の下なら時刻も測らない。成功は `info`、失敗は `warn`、通知の 1 件ずつは `debug`
// ─────────────────────────────

type AnyFunction = (...args: unknown[]) => unknown;

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsed(start: number): number {
  return Math.round(now() - start);
}

/** 要求の失敗を種類と番号だけにする */
function comfyFailure(port: ComfyPort, error: unknown): TraceDetail {
  if (error instanceof ConsentRequiredError) return { failure: 'consent', status: null };
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { failure: 'aborted', status: null };
  }
  const failure = port.connection.failureOf(error);
  if (failure !== null) return { failure: failure.kind, status: failure.status ?? null };
  return { failure: port.run.rejectionOf(error) === null ? 'unknown' : 'rejected', status: null };
}

/** 通知の口の出来事。呼ぶ側の受け取りはそのまま呼ぶ */
function tracedEventOptions(options: EventOptions): EventOptions {
  return {
    ...options,
    onEvent: (event) => {
      traceEvent('comfy', 'debug', 'socket.event', () => ({ type: event.type }));
      options.onEvent(event);
    },
    onStatus: (status) => {
      traceEvent('comfy', 'info', 'socket.status', () => ({ status }));
      options.onStatus(status);
    },
    onRetry: (attempt) => {
      traceEvent('comfy', 'warn', 'socket.retry', () => ({ attempt }));
      options.onRetry?.(attempt);
    },
    onGiveUp: (reason) => {
      traceEvent('comfy', 'warn', 'socket.giveUp', () => ({ reason }));
      options.onGiveUp?.(reason);
    },
  };
}

/** ComfyUI の窓口を包む。Promise を返す関数の結果だけを残し、URL を作る関数などはそのまま通す */
export function traceComfyPort(port: ComfyPort): ComfyPort {
  const traced: Record<string, Record<string, unknown>> = {};
  for (const [group, functions] of Object.entries(port) as [string, Record<string, unknown>][]) {
    const wrapped: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(functions)) {
      if (typeof value !== 'function') {
        wrapped[name] = value;
        continue;
      }
      const call = value as AnyFunction;
      const route = `${group}.${name}`;
      wrapped[name] =
        group === 'events' && name === 'connect'
          ? (options: EventOptions) => call.call(functions, tracedEventOptions(options))
          : (...args: unknown[]) => traceComfyCall(port, route, () => call.apply(functions, args));
    }
    traced[group] = wrapped;
  }
  // 包んだ物は元と同じ群と関数を持つ
  return traced as unknown as ComfyPort;
}

function traceComfyCall(port: ComfyPort, route: string, call: () => unknown): unknown {
  // 失敗は `warn` で残すので、`warn` 以上なら測る
  const measuring = traceEnabled('comfy', 'warn');
  const start = measuring ? now() : 0;
  const result = call();
  if (!measuring || !(result instanceof Promise)) return result;
  return result.then(
    (value: unknown) => {
      traceEvent('comfy', 'info', 'request', () => ({ route, ok: true, ms: elapsed(start) }));
      // 診断の結果は物で返る（配列は来ない）
      if (route === 'connection.diagnose' && isRecord(value)) {
        const { code, status } = value;
        traceEvent('comfy', 'warn', 'connection.diagnosis', () => ({
          code: typeof code === 'string' ? code : null,
          status: typeof status === 'number' ? status : null,
        }));
      }
      return value;
    },
    (error: unknown) => {
      traceEvent('comfy', 'warn', 'request', () => ({
        route,
        ok: false,
        ms: elapsed(start),
        ...comfyFailure(port, error),
      }));
      throw error;
    },
  );
}

/** LLM の窓口を包む。結果の成否と失敗の種類・番号だけを残す（本文・モデル名は残さない） */
export function traceLlmPort(port: LlmPort): LlmPort {
  return {
    listModels: (endpoint, signal) =>
      traceLlmCall('listModels', () => port.listModels(endpoint, signal)),
    checkKey: (endpoint, signal) => traceLlmCall('checkKey', () => port.checkKey(endpoint, signal)),
    streamChat: (endpoint, request, { onEvent, signal }) =>
      traceLlmCall('streamChat', () => port.streamChat(endpoint, request, { onEvent, signal })),
  };
}

async function traceLlmCall<T>(
  route: string,
  call: () => Promise<LlmResult<T>>,
): Promise<LlmResult<T>> {
  if (!traceEnabled('llm', 'warn')) return call();
  const start = now();
  const result = await call();
  if (result.ok) {
    traceEvent('llm', 'info', 'request', () => ({ route, ok: true, ms: elapsed(start) }));
  } else {
    const { kind, status } = result.failure;
    traceEvent('llm', 'warn', 'request', () => ({
      route,
      ok: false,
      ms: elapsed(start),
      failure: kind,
      status: status ?? null,
    }));
  }
  return result;
}
