import { llmTargetOf, type LlmTarget } from '@/store/chat/llm-target';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話で使う接続の設定とモデル（全体で 1 つ）を購読する。
// ─────────────────────────────

/** 会話で使う接続の設定とモデルを返す。設定が一覧に無ければ未接続、モデルが空ならその既定 */
export function useLlmTarget(): LlmTarget {
  const profileId = useSettingsStore((state) => state.llmProfileId);
  const model = useSettingsStore((state) => state.llmModel);
  const profiles = useLlmProfilesStore((state) => state.profiles);
  return llmTargetOf(profileId, model, profiles);
}
