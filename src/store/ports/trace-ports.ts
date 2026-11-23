import { isRecord } from '@/lib/guards';
import { traceEnabled, traceEvent, type TraceDetail } from '@/lib/trace';
import type { ComfyPort, EventOptions } from '@/port/comfy-port';
import type { LlmPort, LlmResult } from '@/port/llm-port';
import { ConsentRequiredError } from '@/store/ports/network-consent';

type AnyFunction = (...args: unknown[]) => unknown;

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsed(start: number): number {
  return Math.round(now() - start);
}

function comfyFailure(port: ComfyPort, error: unknown): TraceDetail {
  if (error instanceof ConsentRequiredError) return { failure: 'consent', status: null };
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { failure: 'aborted', status: null };
  }
  const failure = port.connection.failureOf(error);
  if (failure !== null) return { failure: failure.kind, status: failure.status ?? null };
  return { failure: port.run.rejectionOf(error) === null ? 'unknown' : 'rejected', status: null };
}

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
  return traced as unknown as ComfyPort;
}

function traceComfyCall(port: ComfyPort, route: string, call: () => unknown): unknown {
  const measuring = traceEnabled('comfy', 'warn');
  const start = measuring ? now() : 0;
  const result = call();
  if (!measuring || !(result instanceof Promise)) return result;
  return result.then(
    (value: unknown) => {
      traceEvent('comfy', 'info', 'request', () => ({ route, ok: true, ms: elapsed(start) }));
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
