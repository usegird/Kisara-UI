import { advisorLimitNoticeOf, advisorSummaryRange } from '@/chat/prompt-advisor-summary';
import { useInputLimit } from '@/hooks/chat/use-input-limit';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// 構成の相談の要約の行と、上限に近い知らせ。
// ─────────────────────────────

/** 枠も地も付けない文字のリンク */
const LINK = 'hover:text-foreground underline underline-offset-2 disabled:no-underline';

/** 要約した相談の要約の行。開くと要約の本文を文字のまま出す（初めは閉じる） */
export function AdvisorSummaryRow({ id }: { readonly id: string }): React.ReactElement | null {
  const content = usePromptAdvisorStore((state) => state.sessions[id]?.summary?.content);
  if (content === undefined) return null;
  return (
    <details className="text-muted-foreground max-w-full text-xs">
      <summary className="cursor-pointer select-none">{t('llm.advisor.summary')}</summary>
      <p className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{content}</p>
    </details>
  );
}

/**
 * 上限に近い・上限を超えた（長さで切れた・送れなかった）ときに、縮められる発言があれば、
 * 知らせと「要約する」を出す。受け取り中は出さない
 */
export function AdvisorNearLimit({ id }: { readonly id: string }): React.ReactElement | null {
  const { limit } = useInputLimit();
  const summarizing = usePromptAdvisorStore((state) => state.sessions[id]?.summarizing === true);
  const notice = usePromptAdvisorStore((state) => {
    const session = state.sessions[id];
    if (session === undefined || session.streaming) return null;
    const summarizable =
      session.summarizing || advisorSummaryRange(session.messages, session.summary) !== null;
    if (!summarizable) return null;
    return advisorLimitNoticeOf(session.messages, session.failure, limit);
  });
  if (notice === null) return null;
  const onSummarizeClick = guardPress(
    `advisor-summarize:${id}`,
    () => void usePromptAdvisorStore.getState().summarize(id),
  );
  return (
    <p className="text-muted-foreground text-xs">
      {t(notice === 'over' ? 'llm.advisor.overLimit' : 'llm.advisor.nearLimit')}{' '}
      <button type="button" className={LINK} disabled={summarizing} onClick={onSummarizeClick}>
        {summarizing ? t('llm.summary.running') : t('llm.summary.run')}
      </button>
    </p>
  );
}
