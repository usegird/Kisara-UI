import { inputLimitOf } from '@/chat/tokens';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { contextLengthOf, useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

interface InputLimit {
  readonly context: number | null;
  readonly maxTokens: number | undefined;
  readonly limit: number | null;
}

export function useInputLimit(): InputLimit {
  const { profileId, model } = useLlmTarget();
  const maxTokens = useSettingsStore((state) => state.llmParams.max_tokens);
  const context = useLlmProfilesStore((state) =>
    profileId === null
      ? null
      : contextLengthOf(state.checks[profileId], model, state.learned[profileId]?.[model]),
  );
  return { context, maxTokens, limit: inputLimitOf(context, maxTokens) };
}
