import type { ConnectionProfile } from '@/chat/types';
import type { LlmFailure } from '@/port/llm-port';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話で使う接続の設定・モデル・生成の設定。会話には持たず全体で 1 つ（設定のストア）。
// 選んだ接続の設定が一覧に無ければ未接続（選び直すまで）、モデルが空ならその既定を使う。
// ─────────────────────────────

/** 会話で使う接続の設定の id とモデル */
export interface LlmTarget {
  readonly profileId: string | null;
  readonly model: string;
}

/** 使う接続の設定とモデル。選んだものが一覧に無ければ null、モデルが空ならその既定 */
export function llmTargetOf(
  profileId: string | null,
  model: string,
  profiles: readonly ConnectionProfile[],
): LlmTarget {
  const profile = profiles.find((item) => item.id === profileId);
  return {
    profileId: profile?.id ?? null,
    model: model.trim().length > 0 ? model : (profile?.defaultModel ?? ''),
  };
}

/** 今の使う接続の設定とモデル（手続きから読む） */
export function currentLlmTarget(): LlmTarget {
  const { llmProfileId, llmModel } = useSettingsStore.getState();
  return llmTargetOf(llmProfileId, llmModel, useLlmProfilesStore.getState().profiles);
}

/**
 * 上限を超えたと断られたら、その接続とモデルの上限を覚える（次に送る分を収める）
 */
export function learnOverflow(target: LlmTarget, failure: LlmFailure): void {
  const overflow = failure.overflow;
  if (overflow === undefined || target.profileId === null) return;
  useLlmProfilesStore.getState().learnContext(target.profileId, target.model, overflow.context);
}
