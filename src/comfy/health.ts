import { fetchJson, type FetchLike, type RequestOptions } from '@/comfy/client';
import { featuresUrl, systemStatsUrl } from '@/comfy/endpoints';
import { parseSystemStats } from '@/comfy/schema';
import { isRecord } from '@/lib/guards';
import type { SystemStats } from '@/port/system-stats';

// ─────────────────────────────
// 疎通確認・到達確認と、版と実行環境の取得。
// ─────────────────────────────

/**
 * サーバー機能フラグを取る。応答が軽いので疎通確認に使う（`/object_info` は 20 MB 近くあり重すぎる）。
 * 形が違えば空の物
 */
export async function fetchFeatures(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<Record<string, unknown>> {
  const raw = await fetchJson(featuresUrl(baseUrl), { timeoutMs: 10_000, ...options });
  return isRecord(raw) ? raw : {};
}

/** 版と実行環境を取る。形が違えば null */
export async function fetchSystemStats(
  baseUrl: string,
  options: RequestOptions = {},
): Promise<SystemStats | null> {
  const raw = await fetchJson(systemStatsUrl(baseUrl), { timeoutMs: 10_000, ...options });
  return parseSystemStats(raw);
}

// ─────────────────────────────
// 到達確認
// ─────────────────────────────

/** 中身を読まない要求で確かめた、接続先に届くかどうか */
export type Reachability =
  /** 届いた。応答の中身は読めないが、何かが待ち受けている */
  | 'reachable'
  /** 届かない。起動していない・ポート違い・名前解決不能・証明書エラーなど */
  | 'unreachable'
  /** 時間内に決着しなかった。切り分けに使わない */
  | 'unknown';

const REACHABILITY_TIMEOUT_MS = 5_000;

/**
 * 通常の要求が TypeError で落ちたとき、CORS 拒否なのか接続先が居ないのかを分けるために、
 * **中身を読まない要求**（`mode: 'no-cors'`）をもう一度送る。
 * no-cors の要求は CORS の許可が無くても、届いて何か応答が返れば成功する（opaque response）。
 * したがって成功＝届いている（＝拒まれている）、失敗＝届かない（＝止まっているか URL 違い）。
 * 応答の中身・ステータスは読めないので、生死の切り分け以外には使わない。
 */
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
