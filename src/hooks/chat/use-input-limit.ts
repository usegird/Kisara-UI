import { inputLimitOf } from '@/chat/tokens';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { contextLengthOf, useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話のモデルの文脈長と、送る中身に使える上限を購読する（送るときと同じ計算）。
// ─────────────────────────────

/** 文脈長と max_tokens と、送る中身に使える上限。文脈長が分からなければ上限も null */
interface InputLimit {
  readonly context: number | null;
  readonly maxTokens: number | undefined;
  readonly limit: number | null;
}

/** 会話のモデルの文脈長と、送る中身に使える上限を返す */
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
