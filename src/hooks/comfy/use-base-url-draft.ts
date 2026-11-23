import { useState } from 'react';

import { useSettingsStore } from '@/store/use-settings-store';

export function useBaseUrlDraft(): readonly [string, (value: string) => void] {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [draft, setDraft] = useState(baseUrl);
  const [seen, setSeen] = useState(baseUrl);
  if (seen !== baseUrl) {
    setSeen(baseUrl);
    setDraft(baseUrl);
  }
  return [draft, setDraft];
}
