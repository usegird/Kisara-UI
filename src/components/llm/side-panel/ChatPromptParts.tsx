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

// ─────────────────────────────
// 会話の右の列のプロンプトのタブの、打ちかけを購読する小さな部品（見積もり・合計）と、送る中身を見る所。
// 打つたびにここだけを描き直し、タブの列ごとは描き直さない。
// ─────────────────────────────

/** 合計が上限を超えたら目立たせる */
const totalTone = cva('', { variants: { over: { true: 'text-destructive', false: '' } } });

/** 前回の送信の数（断られた候補の送った数を含む）。上限を超えていれば目立たせる。無ければ出さない */
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

/** 送る中身を見る所の props */
export interface SentPreviewProps {
  readonly chatId: string;
  readonly library: LoreLibrary;
  readonly semantic: SemanticHits;
}

/**
 * 次に送る要求の本文を、送るときと同じ組み立てで見せる。押すと小さなダイアログで
 * 出す（焦点を閉じ込めないので、開いたまま項目を直すと中身も変わる）。データ URL（添えた
 * 画像）は長いので、見るときは頭だけにする
 */
export function SentPreview({ chatId, library, semantic }: SentPreviewProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  // 送る中身に入るのに、親が見ていない設定（生成の設定・添えた画像・Web 検索）が変わっても描き直す
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
        // 長い JSON を中で送るので、高さの決まった大きさにする
        size="lg"
        movable
        modal={false}
        // 会話のタブには嵌める列が無いので、いつも自由移動で出す
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

/**
 * メッセージの項目の見積もり。打ちかけを購読し、打つたびにここだけを描き直す
 */
export function DraftTokens({
  chatId,
  ratio,
}: {
  readonly chatId: string;
  /** 補正の比（会話の見積もりから） */
  readonly ratio: number;
}): React.ReactElement {
  const tokens = useChatStore((state) => estimateMessage(state.drafts[chatId] ?? '', ratio));
  return <>{tokens}</>;
}

/** 合計の見積もりの props */
export interface PromptTotalProps {
  readonly chatId: string;
  /** 打ちかけの分を除いた合計 */
  readonly base: number;
  readonly ratio: number;
  /** 上限。文脈長が分からなければ null */
  readonly limit: number | null;
  /** 上限の内訳（見出しに出す） */
  readonly detail: string;
}

/**
 * 合計の見積もり。打ちかけの分を足して出す（打つたびにここだけを描き直す）
 */
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
