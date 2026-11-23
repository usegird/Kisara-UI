import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MS_PER_MINUTE } from '@/components/ui/units';
import { t } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { budgetWindowMs, resumeLlmBudget } from '@/store/ports/llm-budget';
import { useLlmBudgetStore } from '@/store/use-llm-budget-store';

export function LlmBudgetDialog(): React.ReactElement {
  const asking = useLlmBudgetStore((state) => state.asking);
  const input = useLlmBudgetStore((state) => state.paused?.input ?? 0);
  const output = useLlmBudgetStore((state) => state.paused?.output ?? 0);
  const closeBudget = useLlmBudgetStore((state) => state.close);
  return (
    <ConfirmDialog
      open={asking}
      title={t('llm.budget.title')}
      description={t('llm.budget.description', {
        minutes: String(budgetWindowMs() / MS_PER_MINUTE),
        input: formatNumber(Math.round(input)),
        output: formatNumber(Math.round(output)),
      })}
      confirmLabel={t('llm.budget.resume')}
      cancelLabel={t('llm.budget.keepStopped')}
      onConfirm={resumeLlmBudget}
      onCancel={closeBudget}
    />
  );
}
