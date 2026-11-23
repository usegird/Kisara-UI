import { advisorLimitNoticeOf, advisorSummaryRange } from '@/chat/prompt-advisor-summary';
import { useInputLimit } from '@/hooks/chat/use-input-limit';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

const LINK = 'hover:text-foreground underline underline-offset-2 disabled:no-underline';

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
