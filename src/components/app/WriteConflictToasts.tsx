import { useEffect, useRef } from 'react';

import { TOAST_TIMEOUT, toastManager } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useWriteConflictsStore } from '@/store/use-write-conflicts-store';

// ─────────────────────────────
// ほかのタブで変わった・消えた 1 件を、書かずにトーストで知らせる。
// ─────────────────────────────

/** 食い違いの知らせを 1 件に 1 つ出す。描くものは無い（知らせの出し入れは外の仕組み） */
export function WriteConflictToasts(): null {
  const conflicts = useWriteConflictsStore((state) => state.conflicts);
  /** 知らせを出した 1 件（同じ 1 件に 2 つ出さない） */
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const keys = new Set(conflicts.map((conflict) => conflict.key));
    for (const key of shown.current) if (!keys.has(key)) shown.current.delete(key);

    for (const conflict of conflicts) {
      if (shown.current.has(conflict.key)) continue;
      shown.current.add(conflict.key);
      const { key, name, kind } = conflict;
      const id = toastManager.add({
        title: t(`writeConflict.${kind}.title`, { name }),
        description: t(`writeConflict.${kind}.description`),
        type: 'error',
        timeout: TOAST_TIMEOUT.error,
        onClose: () => useWriteConflictsStore.getState().close(key),
        actionProps: {
          children: t(`writeConflict.${kind}.action`),
          onClick: () => {
            void useWriteConflictsStore.getState().overwrite(key);
            toastManager.close(id);
          },
        },
      });
    }
  }, [conflicts]);

  return null;
}
