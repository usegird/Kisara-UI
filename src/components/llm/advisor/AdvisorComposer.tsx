import { SendHorizontal, Square } from 'lucide-react';

import { WebSearchToggle } from '@/components/llm/workspace/WebSearchToggle';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// 構成の相談の欄の入力欄。
// ─────────────────────────────

/** 入力欄。Enter で送り、Shift+Enter で改行（変換中の Enter は送らない） */
export function AdvisorComposer({
  id,
  streaming,
  inputRef,
}: {
  readonly id: string;
  readonly streaming: boolean;
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>;
}): React.ReactElement {
  const draft = usePromptAdvisorStore((state) => state.sessions[id]?.draft ?? '');
  const target = useLlmTarget();
  // 接続の設定とモデルを選んでいなければ送れない（送るボタンを薄くし、その旨を出す）
  const chosen = target.profileId !== null && target.model.trim().length > 0;
  const store = usePromptAdvisorStore.getState();
  const send = (): void => {
    if (chosen) void store.send(id);
  };
  return (
    <div className="border-t p-2">
      <div
        className="bg-muted/60 focus-within:bg-muted focus-within:outline-ring flex items-end gap-1
          rounded-lg focus-within:outline-1"
      >
        <textarea
          ref={inputRef}
          className="field-sizing-content block max-h-48 min-h-[calc(3lh+16px)] w-full resize-none
            bg-transparent px-3 py-2 text-sm outline-none"
          rows={3}
          value={draft}
          aria-label={t('llm.advisor.input')}
          placeholder={t('llm.advisor.placeholder')}
          onChange={(event) => store.setDraft(id, event.target.value)}
          onKeyDown={(event) => {
            if (isComposingKey(event)) return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        {/* 会話の入力欄と同じく、送るボタンの左に Web のアイコン */}
        <div className="mb-1.5 flex shrink-0 items-center gap-0.5">
          <WebSearchToggle scope="advisor" />
          {streaming ? (
            <button
              type="button"
              className="hover:bg-background/60 inline-flex h-6 w-8 items-center justify-center
                rounded-md"
              aria-label={t('llm.chat.stop')}
              title={t('llm.chat.stop')}
              onClick={() => store.stop(id)}
            >
              <Square className="size-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="text-primary hover:bg-background/60 inline-flex h-6 w-8 items-center
                justify-center rounded-md disabled:opacity-40"
              disabled={draft.trim().length === 0 || !chosen}
              aria-label={t('llm.chat.send')}
              title={chosen ? t('llm.chat.send') : t('llm.advisor.noModel')}
              onClick={send}
            >
              <SendHorizontal className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {chosen ? null : (
        <p className="text-muted-foreground mt-1 px-1 text-xs">{t('llm.advisor.noModel')}</p>
      )}
    </div>
  );
}
