import { useEffect } from 'react';

import type { NodeView } from '@/graph/rows';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

function pendingClasses(views: readonly NodeView[]): string[] {
  const names = new Set<string>();

  for (const view of views) {
    for (const row of view.rows) {
      if (row.type !== 'COMBO' || row.options !== null || row.target === null) continue;

      names.add(row.target.kind === 'node' ? row.target.classType : row.target.innerClassType);
    }
  }
  return [...names].sort();
}

export function useComboOptions(views: readonly NodeView[]): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const ensureOptions = useDefinitionsStore((state) => state.ensureOptions);

  const pending = pendingClasses(views).join('\u0000');

  useEffect(() => {
    if (baseUrl.length === 0 || pending.length === 0) return;

    for (const className of pending.split('\u0000')) {
      void ensureOptions(baseUrl, className);
    }
  }, [pending, baseUrl, ensureOptions]);
}
