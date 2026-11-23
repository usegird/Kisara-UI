import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { isStreaming } from '@/chat/edit';
import { summaryRange } from '@/chat/summary';
import { formatLlmFailure } from '@/components/llm/message/failure-text';
import { buildGenerationFigures } from '@/components/llm/message/response-figures';
import { ResponseStatsButton, ResponseStatsPanel } from '@/components/llm/message/ResponseStats';
import { field } from '@/components/ui/field';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useChatStore } from '@/store/use-chat-store';
import { useChatSummaryStore } from '@/store/use-chat-summary-store';

const FIELD = `${field({ size: 'xs' })} field-sizing-content max-h-80 min-h-20 w-full resize-y`;

const TEXT_BUTTON =
  'text-muted-foreground hover:text-foreground rounded-sm px-1 py-0.5 disabled:opacity-50' +
  ' disabled:hover:text-muted-foreground';

const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-5
  shrink-0 items-center justify-center rounded`;

export function SummarizeButton({ chatId }: { readonly chatId: string }): React.ReactElement {
  const state = useChatSummaryStore((store) => store.states[chatId]);
  const ready = useChatStore((store) => {
    const chat = store.chats[chatId];
    return chat !== undefined && !isStreaming(chat) && summaryRange(chat) !== null;
  });
  const response = useChatStore((store) => store.chats[chatId]?.summary?.response);
  const [statsOpen, setStatsOpen] = useState(false);
  const running = state?.kind === 'running';
  const figures = response === undefined ? [] : buildGenerationFigures(response);
  const showStats = !running && figures.length > 0;
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5">
      <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
        <button
          type="button"
          className={TEXT_BUTTON}
          disabled={!ready || running}
          title={ready ? undefined : t('llm.summary.unavailable')}
          onClick={guardPress(
            `chat-summary:${chatId}`,
            () => void useChatSummaryStore.getState().summarize(chatId),
          )}
        >
          {running ? t('llm.summary.running') : t('llm.summary.run')}
        </button>
        {running ? (
          <Loader2
            className="text-muted-foreground size-3.5 motion-safe:animate-spin"
            aria-hidden
          />
        ) : null}
        {showStats ? (
          <ResponseStatsButton
            open={statsOpen}
            className={ICON_BUTTON}
            onToggle={() => setStatsOpen(!statsOpen)}
          />
        ) : null}
        {state?.kind === 'failed' ? (
          <span role="alert" className="text-destructive min-w-0">
            {formatLlmFailure(state.failure)}
          </span>
        ) : null}
      </span>
      {showStats && statsOpen ? <ResponseStatsPanel figures={[figures]} /> : null}
    </span>
  );
}

export function ChatSummaryField({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement | null {
  const summary = useChatStore((store) => store.chats[chatId]?.summary);
  const update = (content: string): void => {
    if (summary !== undefined) {
      useChatStore.getState().update(chatId, { summary: { ...summary, content } });
    }
  };
  if (summary === undefined) return null;
  return (
    <div className="pt-1">
      <textarea
        className={`${FIELD} leading-relaxed`}
        value={summary.content}
        aria-label={t('llm.summary.field')}
        onChange={(event) => update(event.target.value)}
      />
    </div>
  );
}
