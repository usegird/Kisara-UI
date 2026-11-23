import type { ConnectionProfile } from '@/chat/types';
import type { LlmFailure } from '@/port/llm-port';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

export interface LlmTarget {
  readonly profileId: string | null;
  readonly model: string;
}

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

export function currentLlmTarget(): LlmTarget {
  const { llmProfileId, llmModel } = useSettingsStore.getState();
  return llmTargetOf(llmProfileId, llmModel, useLlmProfilesStore.getState().profiles);
}

export function learnOverflow(target: LlmTarget, failure: LlmFailure): void {
  const overflow = failure.overflow;
  if (overflow === undefined || target.profileId === null) return;
  useLlmProfilesStore.getState().learnContext(target.profileId, target.model, overflow.context);
}
