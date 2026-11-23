import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MS_PER_SECOND } from '@/components/ui/units';
import { t } from '@/i18n';
import { formatElapsed } from '@/i18n/format';

export function ReceivingIndicator({
  since,
  tooling = false,
  results = 0,
}: {
  readonly since?: number | undefined;
  readonly tooling?: boolean;
  readonly results?: number;
}): React.ReactElement {
  const [start] = useState(() => since ?? performance.now());
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), MS_PER_SECOND);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span
      role="status"
      aria-label={t('llm.chat.receiving')}
      className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums"
    >
      <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden />
      {formatElapsed(now - start)}
      {tooling ? <span className="ml-1">{t('llm.chat.toolRunning')}</span> : null}
      {results > 0 ? (
        <span className="ml-1">{t('llm.chat.searchResults', { count: results })}</span>
      ) : null}
    </span>
  );
}
