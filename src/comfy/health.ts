import { fetchJson, type FetchLike, type RequestOptions } from '@/comfy/client';
import { featuresUrl, systemStatsUrl } from '@/comfy/endpoints';
import { parseSystemStats } from '@/comfy/schema';
import { isRecord } from '@/lib/guards';
import type { SystemStats } from '@/port/system-stats';

export async function fetchFeatures(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<Record<string, unknown>> {
  const raw = await fetchJson(featuresUrl(baseUrl), { timeoutMs: 10_000, ...options });
  return isRecord(raw) ? raw : {};
}

export async function fetchSystemStats(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<SystemStats | null> {
  const raw = await fetchJson(systemStatsUrl(baseUrl), { timeoutMs: 10_000, ...options });
  return parseSystemStats(raw);
}

export type Reachability =
  | 'reachable'
  | 'unreachable'
  | 'unknown';

const REACHABILITY_TIMEOUT_MS = 5_000;

export async function probeReachability(
  baseUrl: string,
  options: { readonly fetchImpl?: FetchLike; readonly timeoutMs?: number } = {},
): Promise<Reachability> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REACHABILITY_TIMEOUT_MS);

  try {
    await fetchImpl(featuresUrl(baseUrl), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return 'reachable';
  } catch {
    return controller.signal.aborted ? 'unknown' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
