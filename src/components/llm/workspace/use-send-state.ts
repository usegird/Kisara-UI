import { isStreaming } from '@/chat/edit';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { canSend, isBlocked, useChatStore } from '@/store/use-chat-store';
import { isKeyMissing, useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話を送れるか。入力欄の送るボタンとプレイブックの操作で使う。
// ─────────────────────────────

/** 送れるか。`model` はつながっていてモデルだけを選んでいない。`key` はキーが要るのに無い */
export type SendState = 'ready' | 'connect' | 'model' | 'key' | 'wait';

/**
 * 送れるか。送れないなら、キーを入れれば送れる（`key`）か、つなげば送れる（`connect`）か、
 * モデルを選べば送れる（`model`）か、待つしかない（`wait`。受け取り中・容量の不足）か。
 * 受け取り中・接続の設定の変化・接続の確かめ・キーの有無・モデルの選択・容量の不足で変わる
 */
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
  // つながっていると確かめた接続の設定でだけ送る
  const connected = useLlmProfilesStore(
    (state) => target.profileId !== null && state.checks[target.profileId]?.kind === 'ok',
  );
  // 上限を変えたら送れるかを決め直す
  const maxMegabytes = useSettingsStore((state) => state.chatMaxMegabytes);
  const state = useChatStore((store) => {
    const chat = store.chats[chatId];
    if (chat === undefined || isStreaming(chat) || isBlocked(store, chatId, maxMegabytes)) {
      return 'wait';
    }
    return canSend(chat, target, profiles) ? 'ready' : 'connect';
  });
  if (state === 'wait') return state;
  // キーが無いと、つないでもモデルを選んでも送れないので先に促す
  if (keyMissing) return 'key';
  if (state !== 'connect') return connected ? state : 'connect';
  // 送れない理由がモデルだけ（つながっていて、名前が空）なら、モデルを選ぶよう促す
  return connected && target.model.trim().length === 0 ? 'model' : 'connect';
}
