import { useEffect } from 'react';

import { chatBytes } from '@/chat/size';
import { t } from '@/i18n';
import { formatMegabytes } from '@/lib/file-size';
import { ensurePersisted } from '@/store/persist/storage-estimate';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { chatSizeLevelOf, useChatStore, type ChatPending } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の置き場（ブラウザ）の知らせ。ComfyUI の控えが書けないことは出さない（ブラウザには書けている）。
// ─────────────────────────────

/** 会話をブラウザに書けない・書けなくなりそうな知らせ。メッセージのある会話を開いたら消さないよう頼む */
export function ChatSaveNotice({ chatId }: { readonly chatId: string }): React.ReactElement | null {
  const saveState = useChatStore((state) => state.saveStates[chatId]);
  const nearFull = useChatStore((state) => state.nearFull);
  const hasMessages = useChatStore((state) => (state.chats[chatId]?.messages.length ?? 0) > 0);
  // 大きさは注意を出すときだけ 0.1MB 刻みで読む（受け取り中に語ごとに描き直さない）
  const maxMegabytes = useSettingsStore((state) => state.chatMaxMegabytes);
  const sizeLevel = useChatStore((state) => chatSizeLevelOf(state, chatId, maxMegabytes));
  const sizeText = useChatStore((state) => {
    const chat = state.chats[chatId];
    if (chat === undefined || chatSizeLevelOf(state, chatId, maxMegabytes) !== 'near') return '';
    return formatMegabytes(chatBytes(chat));
  });

  // 頼むのはブラウザの外の仕組み（1 回の読み込みで一度だけ）
  useEffect(() => {
    if (hasMessages) void ensurePersisted();
  }, [hasMessages]);

  if (saveState === 'full') {
    return (
      <div
        role="alert"
        className="border-destructive/40 bg-destructive/10 text-destructive flex flex-wrap
          items-center gap-2 rounded-md border px-3 py-2 text-xs"
      >
        <span className="min-w-0 flex-1">{t('llm.save.fullBrowser')}</span>
        <button
          type="button"
          className="border-destructive/40 hover:bg-destructive/15 rounded border px-2 py-0.5"
          onClick={() => useChatLibraryStore.getState().openList()}
        >
          {t('llm.save.tidy')}
        </button>
      </div>
    );
  }
  if (saveState === 'unsaved') {
    return (
      <p role="status" className="text-destructive text-xs">
        {t('llm.save.unsavedBrowser')}
      </p>
    );
  }
  if (sizeLevel === 'full') {
    return (
      <p
        role="alert"
        className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3
          py-2 text-xs"
      >
        {t('llm.limits.full', { max: maxMegabytes })}
      </p>
    );
  }
  if (sizeLevel === 'near') {
    return (
      <p role="status" className="text-muted-foreground text-xs">
        {t('llm.limits.near', { size: sizeText, max: maxMegabytes })}
      </p>
    );
  }
  if (nearFull) {
    return (
      <p role="status" className="text-muted-foreground text-xs">
        {t('llm.save.nearFull')}
      </p>
    );
  }
  return null;
}

/** タブで開いたが、まだ中身を持っていない会話の知らせ */
export function ChatPendingNotice({
  pending,
}: {
  readonly pending: ChatPending | undefined;
}): React.ReactElement {
  const text = pendingTextOf(pending);
  return (
    <p
      role="status"
      className="text-muted-foreground mx-auto max-w-xl px-6 py-16 text-center text-sm"
    >
      {text}
    </p>
  );
}

/** まだ中身を持っていない会話の知らせの文 */
function pendingTextOf(pending: ChatPending | undefined): string {
  if (pending === undefined) return t('common.loading');
  switch (pending.kind) {
    case 'loading':
      return t('common.loading');
    case 'waiting':
      return t('llm.save.waitingComfy', { url: pending.baseUrl });
    case 'elsewhere':
      return t('llm.library.openElsewhere');
    case 'broken':
      return t('llm.library.broken');
    case 'failed':
      return t('llm.library.loadFailed');
    default:
      return t('llm.library.missing');
  }
}
