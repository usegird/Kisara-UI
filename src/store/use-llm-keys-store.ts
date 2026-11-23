import { create } from 'zustand';

import { isCloudService } from '@/chat/cloud-service';
import type { ConnectionProfile } from '@/chat/types';
import { parseHttpBaseUrl } from '@/lib/web-url';

interface LlmKeysState {
  readonly keyed: readonly string[];
}

export const useLlmKeysStore = create<LlmKeysState>()(() => ({ keyed: [] }));

export function hasLlmKey(keyed: readonly string[], baseUrl: string): boolean {
  const parsed = parseHttpBaseUrl(baseUrl);
  return parsed.kind === 'ok' && keyed.includes(parsed.url);
}

export function hasLlmKeyNow(baseUrl: string): boolean {
  return hasLlmKey(useLlmKeysStore.getState().keyed, baseUrl);
}

export function isKeyMissing(
  profile: Pick<ConnectionProfile, 'baseUrl' | 'keyRequired'>,
  keyed: readonly string[],
  authFailed: boolean,
): boolean {
  if (profile.baseUrl.trim().length === 0) return false;
  if (authFailed) return true;
  if (hasLlmKey(keyed, profile.baseUrl)) return false;
  return profile.keyRequired || isCloudService(profile.baseUrl);
}
