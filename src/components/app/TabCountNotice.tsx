import { useEffect, useRef } from 'react';

import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useTabsStore } from '@/store/use-tabs-store';

export const TAB_COUNT_NOTICE = 20;

export function TabCountNotice(): null {
  const count = useTabsStore((state) => state.tabs.length);
  const noticed = useRef(false);

  useEffect(() => {
    if (count <= TAB_COUNT_NOTICE) {
      noticed.current = false;
      return;
    }
    if (noticed.current) return;
    noticed.current = true;
    toastError(
      t('app.tabCount.title', { limit: String(TAB_COUNT_NOTICE) }),
      t('app.tabCount.description'),
    );
  }, [count]);

  return null;
}
