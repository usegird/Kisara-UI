import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MS_PER_SECOND } from '@/components/ui/units';
import { t } from '@/i18n';
import { formatElapsed } from '@/i18n/format';

// ─────────────────────────────
// 受け取り中の印。時計は 1 秒ごとにこの部品だけを描き直す（本文の発言は描き直さない）。
// ─────────────────────────────

/** 受け取り中の回る印と、送ってからの経過時間・ツールの実行中・検索結果の数 */
export function ReceivingIndicator({
  since,
  tooling = false,
  results = 0,
}: {
  /** 送った時刻（`performance.now()` の ms）。分からなければ出したときから数える */
  readonly since?: number | undefined;
  /** サーバー側のツールを動かしているとみなすか（「ツールを実行中」を出す） */
  readonly tooling?: boolean;
  /** 届いた出典の数（1 件以上で「検索結果 N 件」を出す） */
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
