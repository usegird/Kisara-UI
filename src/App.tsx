import { useEffect } from 'react';

import { AppShell } from '@/components/app/AppShell';
import { RootFallback } from '@/components/app/RootFallback';
import { moveToWelcome } from '@/components/app/welcome-link';
import { comfyShell } from '@/components/comfy/shell-parts';
import { chatShell } from '@/components/llm/shell-parts';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';
import { isAccepted, useTermsStore } from '@/store/use-terms-store';

export function App(): React.ReactElement {
  const accepted = useTermsStore((state) => isAccepted(state.accepted));
  useEffect(() => {
    if (!accepted) moveToWelcome();
  }, [accepted]);
  return (
    <ErrorBoundary
      label={t('app.boundary')}
      fallback={(error, retry) => <RootFallback error={error} onRetry={retry} />}
    >
      {accepted ? <AppShell workflow={comfyShell} chat={chatShell} /> : null}
    </ErrorBoundary>
  );
}
