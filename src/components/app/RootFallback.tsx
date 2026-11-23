import { FileDown, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { t } from '@/i18n';
import { downloadText } from '@/lib/download';
import { reloadPage } from '@/lib/reload-page';
import {
  buildDiagnostics,
  diagnosticsFileName,
  FALLBACK_SECTIONS,
  formatDiagnostics,
  readDiagnosticsInputs,
} from '@/store/diagnostics/diagnostics-file';
import { discardSession } from '@/store/persist/session';

async function fallbackDiagnostics(): Promise<string> {
  const inputs = await readDiagnosticsInputs({ comfySystem: false });
  return formatDiagnostics(buildDiagnostics(inputs, FALLBACK_SECTIONS));
}

const FALLBACK_BUTTON =
  'border-input hover:bg-muted inline-flex items-center gap-1.5 rounded border px-3 py-1';

export interface RootFallbackProps {
  readonly error: Error;
  readonly onRetry: () => void;
}

export function RootFallback({ error, onRetry }: RootFallbackProps): React.ReactElement {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div role="alert" className="bg-background text-foreground flex h-full items-center p-6">
      <div className="mx-auto flex max-w-lg flex-col gap-3 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="text-destructive size-4" aria-hidden />
          {t('app.rootFallback.title')}
        </p>
        <p className="text-muted-foreground break-all text-xs">{error.message}</p>
        <p className="text-muted-foreground text-xs">{t('app.rootFallback.hint')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="border-input hover:bg-muted inline-flex items-center gap-1.5 rounded border
              px-3 py-1"
            onClick={onRetry}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t('app.rootFallback.retry')}
          </button>
          <button
            type="button"
            className="border-input hover:bg-muted inline-flex items-center gap-1.5 rounded border
              px-3 py-1"
            onClick={reloadPage}
          >
            {t('app.rootFallback.reload')}
          </button>
          <button
            type="button"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 inline-flex
              items-center gap-1.5 rounded border px-3 py-1"
            onClick={() => {
              void discardSession().finally(reloadPage);
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t('app.rootFallback.discard')}
          </button>
          <button
            type="button"
            className={FALLBACK_BUTTON}
            onClick={() => void fallbackDiagnostics().then(setPreview)}
          >
            <FileDown className="size-3.5" aria-hidden />
            {t('app.rootFallback.diagnostics')}
          </button>
        </div>
        {preview !== null && (
          <div className="flex flex-col gap-2">
            <textarea
              readOnly
              value={preview}
              aria-label={t('app.rootFallback.previewLabel')}
              className="border-input h-64 w-full resize-y rounded border p-2 font-mono text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={FALLBACK_BUTTON}
                onClick={() => {
                  downloadText(preview, diagnosticsFileName(), 'application/json');
                  setPreview(null);
                }}
              >
                <FileDown className="size-3.5" aria-hidden />
                {t('app.rootFallback.save')}
              </button>
              <button type="button" className={FALLBACK_BUTTON} onClick={() => setPreview(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
