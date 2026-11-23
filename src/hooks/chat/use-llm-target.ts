import { llmTargetOf, type LlmTarget } from '@/store/chat/llm-target';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function useLlmTarget(): LlmTarget {
  const profileId = useSettingsStore((state) => state.llmProfileId);
  const model = useSettingsStore((state) => state.llmModel);
  const profiles = useLlmProfilesStore((state) => state.profiles);
  return llmTargetOf(profileId, model, profiles);
}
