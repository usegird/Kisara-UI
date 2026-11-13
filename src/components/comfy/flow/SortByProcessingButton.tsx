import { ArrowDownWideNarrow } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// 処理の順（上流が先）に並べ直すアイコン。押して確かめたときだけ並べ直す。
// ─────────────────────────────

/** 処理の順に並べ直すアイコンと、原点から置き直すかを選べる確かめのダイアログ */
export function SortByProcessingButton(): React.ReactElement {
  const sort = useGraphStore((state) => state.sortByProcessing);
  const [confirming, setConfirming] = useState(false);
  const [fromOrigin, setFromOrigin] = useState(false);

  return (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1
        opacity-60 transition-opacity hover:opacity-100"
        aria-label={t('flow.sort.label')}
        title={t('flow.sort.title')}
        onClick={() => {
          setFromOrigin(false);
          setConfirming(true);
        }}
      >
        <ArrowDownWideNarrow className="size-4" aria-hidden />
      </button>

      {/* 並べた順が一度に入れ替わるので、押し間違いで崩さないよう確かめる */}
      <ConfirmDialog
        open={confirming}
        title={t('flow.sort.confirmTitle')}
        description={t('flow.sort.confirmDescription')}
        confirmLabel={t('flow.sort.confirm')}
        onConfirm={() => {
          sort(fromOrigin);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      >
        <label
          className="text-muted-foreground mt-3 flex items-center gap-2 text-xs"
          title={t('flow.sort.fromOriginTitle')}
        >
          <input
            type="checkbox"
            checked={fromOrigin}
            onChange={(event) => setFromOrigin(event.target.checked)}
          />
          {t('flow.sort.fromOrigin')}
        </label>
      </ConfirmDialog>
    </>
  );
}
