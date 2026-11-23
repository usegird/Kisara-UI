import { isStreaming } from '@/chat/edit';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { canSend, isBlocked, useChatStore } from '@/store/use-chat-store';
import { isKeyMissing, useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

export type SendState = 'ready' | 'connect' | 'model' | 'key' | 'wait';

export function useSendState(chatId: string): SendState {
  const profiles = useLlmProfilesStore((state) => state.profiles);
  const target = useLlmTarget();
  const authFailed = useLlmProfilesStore((state) => {
    const check = target.profileId === null ? undefined : state.checks[target.profileId];
    return check?.kind === 'failed' && check.failure.kind === 'auth';
  });
  const keyed = useLlmKeysStore((state) => state.keyed);
  const profile = profiles.find((item) => item.id === target.profileId);
  const keyMissing = profile !== undefined && isKeyMissing(profile, keyed, authFailed);
  const connected = useLlmProfilesStore(
    (state) => target.profileId !== null && state.checks[target.profileId]?.kind === 'ok',
  );
  const maxMegabytes = useSettingsStore((state) => state.chatMaxMegabytes);
  const state = useChatStore((store) => {
    const chat = store.chats[chatId];
    if (chat === undefined || isStreaming(chat) || isBlocked(store, chatId, maxMegabytes)) {
      return 'wait';
    }
    return canSend(chat, target, profiles) ? 'ready' : 'connect';
  });
  if (state === 'wait') return state;
  if (keyMissing) return 'key';
  if (state !== 'connect') return connected ? state : 'connect';
  return connected && target.model.trim().length === 0 ? 'model' : 'connect';
}
