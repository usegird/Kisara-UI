import { Loader2, RotateCcw, TriangleAlert } from 'lucide-react';

import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { t } from '@/i18n';
import { reloadPage } from '@/lib/reload-page';

// ─────────────────────────────
// 開いたときだけ読む部品（lazy-part）が、読んでいる間と読めなかったときに出すもの。
// 作る側の関数とは別ファイルに置く（部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/** 読んでいる間の中身。枠は呼び出し側が置く */
export function PartLoading({ label }: { readonly label: string }): React.ReactElement {
  return (
    <div
      role="status"
      className="text-muted-foreground flex min-h-24 flex-1 items-center justify-center gap-2
        p-6 text-xs"
    >
      <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
      {t('ui.partLoading.loading', { label })}
    </div>
  );
}

/** 読めなかったときの差し替え。枠が無くても見えるよう、画面の上部に浮かせる */
export function PartLoadFault({
  label,
  error,
}: {
  readonly label: string;
  readonly error: Error;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="border-destructive/50 bg-card text-foreground fixed inset-x-0 top-24 z-50 mx-auto
        flex w-96 max-w-[90vw] flex-col gap-1.5 rounded border p-3 text-xs shadow-lg"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="text-destructive size-3.5 shrink-0" aria-hidden />
        {t('ui.partLoading.failed', { label })}
      </p>
      <p className="text-muted-foreground break-all">{error.message}</p>
      <p className="text-muted-foreground">{t('ui.partLoading.staleHint')}</p>
      <div>
        <button type="button" className={FALLBACK_BUTTON_CLASS} onClick={reloadPage}>
          <RotateCcw className="size-3" aria-hidden />
          {t('ui.partLoading.reload')}
        </button>
      </div>
    </div>
  );
}
