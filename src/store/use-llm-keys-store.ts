import { create } from 'zustand';

import { isCloudService } from '@/chat/cloud-service';
import type { ConnectionProfile } from '@/chat/types';
import { parseHttpBaseUrl } from '@/lib/web-url';

// ─────────────────────────────
// ゲートウェイが API キーを持つ接続先の写し。キーそのものは持たない。ゲートウェイの窓口の受け口が書く。
// ─────────────────────────────

/** キーのある接続先（整えたベース URL） */
interface LlmKeysState {
  readonly keyed: readonly string[];
}

export const useLlmKeysStore = create<LlmKeysState>()(() => ({ keyed: [] }));

/** そのベース URL のキーがゲートウェイにあるか（末尾の `/` などは整えて比べる） */
export function hasLlmKey(keyed: readonly string[], baseUrl: string): boolean {
  const parsed = parseHttpBaseUrl(baseUrl);
  return parsed.kind === 'ok' && keyed.includes(parsed.url);
}

/** 今、そのベース URL のキーがゲートウェイにあるか */
export function hasLlmKeyNow(baseUrl: string): boolean {
  return hasLlmKey(useLlmKeysStore.getState().keyed, baseUrl);
}

/**
 * キーが要るのに使えるキーが無いか。キーが断られた、またはゲートウェイにキーが無く、
 * キーが要る設定（前にキーを入れてつないだ）か OpenRouter（一覧はキー無しでも返す）のとき
 */
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
