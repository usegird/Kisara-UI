import { useEffect } from 'react';

import { useTabLabel } from '@/hooks/shell/use-tab-label';
import { t } from '@/i18n';
import { useTabsStore } from '@/store/use-tabs-store';

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
  useEffect(() => {
    document.title = name === null ? 'KisaraUI' : t('app.documentTitle', { name });
  }, [name]);
}
