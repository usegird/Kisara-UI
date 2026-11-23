import { cva } from 'class-variance-authority';
import { Globe } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t, type MessageKey } from '@/i18n';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import {
  effectiveWebState,
  useWebSearchStore,
  webModesFor,
  type WebScope,
  type WebState,
} from '@/store/use-web-search-store';

const toggle = cva(
  'hover:bg-background/60 inline-flex h-6 w-8 items-center justify-center rounded-md',
  {
    variants: {
      on: {
        true: 'text-tool-active',
        false: 'text-muted-foreground hover:text-foreground',
      },
    },
  },
);

const TITLE: Readonly<Record<WebState, MessageKey>> = {
  off: 'llm.webSearch.off',
  search: 'llm.webSearch.search',
};

function useSearchAvailable(): boolean {
  const { profileId } = useLlmTarget();
  const search = useSettingsStore((state) => state.webSearchEngine);
  const baseUrl = useLlmProfilesStore(
    (state) => state.profiles.find((item) => item.id === profileId)?.baseUrl ?? '',
  );
  return webModesFor(baseUrl, { search, calls: 1, contentTokens: 1 }).includes('search');
}

export function WebSearchToggle({
  scope,
}: {
  readonly scope: WebScope;
}): React.ReactElement | null {
  const available = useSearchAvailable();
  const chosen = useWebSearchStore((state) => state.modes[scope]);
  const [asking, setAsking] = useState(false);
  if (!available) return null;
  const mode = effectiveWebState(chosen, ['search']);
  const store = useWebSearchStore.getState();
  return (
    <>
      <button
        type="button"
        className={toggle({ on: mode !== 'off' })}
        aria-label={t(TITLE[mode])}
        title={t(TITLE[mode])}
        onClick={() => {
          if (mode === 'off' && !store.agreed) setAsking(true);
          else store.cycle(scope);
        }}
      >
        <Globe className="size-4" aria-hidden />
      </button>
      <ConfirmDialog
        open={asking}
        title={t('llm.webSearch.confirmTitle')}
        description={t('llm.webSearch.confirmDescription')}
        confirmLabel={t('llm.webSearch.enable')}
        cancelLabel={t('llm.webSearch.cancel')}
        onConfirm={() => {
          setAsking(false);
          store.agree();
          store.cycle(scope);
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
