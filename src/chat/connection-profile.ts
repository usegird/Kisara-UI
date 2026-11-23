import type { ConnectionProfile } from '@/chat/types';
import { trimBaseUrl } from '@/lib/url-history';
import type { LlmEndpoint } from '@/port/llm-port';

export function sameBaseUrl(a: string, b: string): boolean {
  return trimBaseUrl(a) === trimBaseUrl(b);
}

export function endpointOf(profile: ConnectionProfile): LlmEndpoint {
  return { baseUrl: profile.baseUrl };
}

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
