import type { ConnectionProfile } from '@/chat/types';
import { trimBaseUrl } from '@/lib/url-history';
import type { LlmEndpoint } from '@/port/llm-port';

// ─────────────────────────────
// 接続するときに書く先の接続の設定を、ベース URL で見分けて選ぶ。
// ─────────────────────────────

/** 同じベース URL か（前後の空白と末尾の `/` は問わない） */
export function sameBaseUrl(a: string, b: string): boolean {
  return trimBaseUrl(a) === trimBaseUrl(b);
}

/** 接続の設定の送り先 */
export function endpointOf(profile: ConnectionProfile): LlmEndpoint {
  return { baseUrl: profile.baseUrl };
}

/**
 * 接続するときに書く先の設定。同じベース URL の設定、無ければ選んでいる設定がまだ URL を持たないならそれ。
 * どれも無ければ undefined（新しく作る）
 */
export function profileForConnect(
  profiles: readonly ConnectionProfile[],
  baseUrl: string,
  current: ConnectionProfile | undefined,
): ConnectionProfile | undefined {
  return (
    profiles.find((profile) => sameBaseUrl(profile.baseUrl, baseUrl)) ??
    (current !== undefined && current.baseUrl.trim().length === 0 ? current : undefined)
  );
}
