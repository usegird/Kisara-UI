import { cva } from 'class-variance-authority';
import { useState } from 'react';

import type { LoreLibrary } from '@/chat/chat-sources';
import type { SemanticHits } from '@/chat/semantic';
import { estimateMessage } from '@/chat/tokens';
import { shortenDataUrl } from '@/components/llm/message/data-url-text';
import { DialogFrame } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { previewSendRequest, useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWebSearchStore } from '@/store/use-web-search-store';

const totalTone = cva('', { variants: { over: { true: 'text-destructive', false: '' } } });

export function LastActual({
  count,
  over,
}: {
  readonly count: number | null;
  readonly over: boolean;
}): React.ReactElement | null {
  if (count === null) return null;
  return <span className={totalTone({ over })}>{t('llm.prompt.lastActual', { count })}</span>;
}

export interface SentPreviewProps {
  readonly chatId: string;
  readonly library: LoreLibrary;
  readonly semantic: SemanticHits;
}

export function SentPreview({ chatId, library, semantic }: SentPreviewProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  useSettingsStore((state) => state.llmParams);
  useChatStore((state) => state.draftImages[chatId]);
  useWebSearchStore((state) => state.modes.chat);
  const request = open ? previewSendRequest(chatId, library, semantic) : null;
  const onPreviewClick = (): void => setOpen(true);
  return (
    <div className="flex justify-end px-1">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground underline underline-offset-2"
        onClick={onPreviewClick}
      >
        {t('llm.prompt.preview')}
      </button>
      <DialogFrame
        id="llm-sent-preview"
        size="lg"
        movable
        modal={false}
        embeddable={false}
        open={open}
        onOpenChange={setOpen}
        title={t('llm.prompt.previewTitle')}
      >
        <pre className="bg-muted/50 m-2 min-h-0 flex-1 overflow-auto rounded-md p-2 font-mono text-3xs whitespace-pre-wrap">
          {request === null ? '' : JSON.stringify(request, shortenDataUrl, 2)}
        </pre>
      </DialogFrame>
    </div>
  );
}

export function DraftTokens({
  chatId,
  ratio,
}: {
  readonly chatId: string;
  readonly ratio: number;
}): React.ReactElement {
  const tokens = useChatStore((state) => estimateMessage(state.drafts[chatId] ?? '', ratio));
  return <>{tokens}</>;
}

export interface PromptTotalProps {
  readonly chatId: string;
  readonly base: number;
  readonly ratio: number;
  readonly limit: number | null;
  readonly detail: string;
}

export function PromptTotal({
  chatId,
  base,
  ratio,
  limit,
  detail,
}: PromptTotalProps): React.ReactElement {
  const draftTokens = useChatStore((state) => estimateMessage(state.drafts[chatId] ?? '', ratio));
  const total = base + draftTokens;
  if (limit === null) return <span>{t('llm.prompt.total', { count: total })}</span>;
  return (
    <span className={totalTone({ over: total > limit })} title={detail}>
      {t('llm.prompt.totalOfLimit', { count: total, limit })}
    </span>
  );
}
