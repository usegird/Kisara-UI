import { useEffect } from 'react';

import { useTabLabel } from '@/hooks/shell/use-tab-label';
import { useWelcomeRoute } from '@/hooks/shell/use-welcome-route';
import { t } from '@/i18n';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// ブラウザのタブの題名をアクティブなタブに合わせる（WCAG 2.4.2 を満たす）。
// ─────────────────────────────

/**
 * ブラウザのタブの題名を、アクティブなタブの名前に合わせて書き換える。
 * 名前の無いタブは種類だけにする（会話の最初の発言の頭を、ブラウザの履歴や画面共有に出さない）。
 */
export function useDocumentTitle(activeId: string): void {
  const label = useTabLabel(activeId);
  const kind = useTabsStore((state) => state.tabs.find((tab) => tab.id === state.activeId)?.kind);
  const name =
    label.name.length > 0
      ? label.name
      : kind === 'chat'
        ? t('app.tabs.kind.chat')
        : kind === 'workflow'
          ? t('app.tabs.kind.workflow')
          : null;
  const welcome = useWelcomeRoute();
  useEffect(() => {
    document.title = welcome || name === null ? 'KisaraUI' : t('app.documentTitle', { name });
  }, [welcome, name]);
}
