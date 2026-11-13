import { useEffect, useRef } from 'react';

import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 上のタブが多すぎたら閉じるよう促す。止めはしない。
// ─────────────────────────────

/** これを超えたら促す数 */
export const TAB_COUNT_NOTICE = 20;

/** タブの数の知らせを出す。描くものは無い（知らせの出し入れは外の仕組み） */
export function TabCountNotice(): null {
  const count = useTabsStore((state) => state.tabs.length);
  /** 超えている間に 1 回だけ出す */
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
