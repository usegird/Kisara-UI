import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  modelName,
  RUNTIME_SIZE,
  semanticModelFor,
  type SemanticModel,
} from '@/chat/semantic-models';
import { EmbeddingModelField } from '@/components/llm/dictionary/EmbeddingModelField';
import { CARD_BODY } from '@/components/llm/side-panel/extension-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { smallButton } from '@/components/ui/small-button';
import { PERCENT } from '@/components/ui/units';
import { activeLocale, t } from '@/i18n';
import { wholeMegabytes } from '@/lib/file-size';
import { guardPress } from '@/lib/press-guard';
import type { StoredEmbeddingModel } from '@/port/embedding-port';
import { useSemanticStore, type SemanticStatus } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

const BUTTON = smallButton({ fade: true });

const ICON_BUTTON = 'hover:bg-muted rounded p-0.5';

const statusText = cva('text-xs', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

function formatStatus(status: SemanticStatus, progress: number, error: string): string {
  switch (status) {
    case 'loading':
      return t('llm.extension.semantic.loading', { percent: Math.floor(progress * PERCENT) });
    case 'failed':
      return t('llm.extension.semantic.failed', { reason: error });
    case 'ready':
    case 'off':
      return '';
  }
}

function targetModel(): SemanticModel {
  return semanticModelFor(activeLocale(), useSettingsStore.getState().embeddingModel);
}

function formatModelConfirm(model: SemanticModel): string {
  return model.size === null
    ? t('llm.extension.semantic.confirmModelUnknown', { name: model.id })
    : t('llm.extension.semantic.confirmModel', { name: model.id, size: model.size });
}

export function SemanticCard(): React.ReactElement {
  const enabled = useSettingsStore((state) => state.loreSemantic);
  const status = useSemanticStore((state) => state.status);
  const progress = useSemanticStore((state) => state.progress);
  const error = useSemanticStore((state) => state.error);
  const loadedId = useSemanticStore((state) => state.loadedId);
  const stored = useSemanticStore((state) => state.stored);
  const [asking, setAsking] = useState<SemanticModel | null>(null);
  const line = enabled ? formatStatus(status, progress, error) : '';

  useEffect(() => {
    void useSemanticStore.getState().refreshStored();
  }, []);

  const enable = (): void => {
    useSettingsStore.getState().setLoreSemantic(true);
    void useSemanticStore.getState().load();
  };

  const toggle = (on: boolean): void => {
    if (!on) {
      useSettingsStore.getState().setLoreSemantic(false);
      void useSemanticStore.getState().disable();
      return;
    }
    const model = targetModel();
    if (stored.some((entry) => entry.id === model.id)) enable();
    else setAsking(model);
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border p-2" aria-labelledby="semantic">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => toggle(event.target.checked)}
        />
        <span id="semantic">{t('llm.extension.semantic.title')}</span>
      </label>
      <div className={CARD_BODY}>
        <p className="text-muted-foreground text-2xs">{t('llm.extension.semantic.hint')}</p>
        {line.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className={statusText({ failed: status === 'failed' })} role="status">
              {line}
            </p>
            {status === 'failed' ? (
              <button
                type="button"
                className={BUTTON}
                onClick={guardPress('semantic-load', () => void useSemanticStore.getState().load())}
              >
                {t('llm.extension.semantic.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {stored.length === 0 ? null : (
          <ul className="flex flex-col gap-0.5">
            {stored.map((entry) => (
              <StoredModelRow
                key={entry.id}
                entry={entry}
                loaded={enabled && status === 'ready' && entry.id === loadedId}
              />
            ))}
          </ul>
        )}
        <EmbeddingModelField />
      </div>
      <ConfirmDialog
        open={asking !== null}
        title={t('llm.extension.semantic.confirmTitle')}
        description={t('llm.extension.semantic.confirmDescription')}
        confirmLabel={t('llm.extension.semantic.confirm')}
        onConfirm={() => {
          setAsking(null);
          enable();
        }}
        onCancel={() => setAsking(null)}
      >
        {asking === null ? null : (
          <div className="text-muted-foreground mt-1 text-xs">
            <p>{formatModelConfirm(asking)}</p>
            <p>{t('llm.extension.semantic.confirmRuntime', { size: RUNTIME_SIZE })}</p>
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}

function StoredModelRow({
  entry,
  loaded,
}: {
  readonly entry: StoredEmbeddingModel;
  readonly loaded: boolean;
}): React.ReactElement {
  const name = modelName(entry.id);
  const values = { name, size: wholeMegabytes(entry.bytes) };
  return (
    <li className="flex items-center gap-1">
      <p className="text-muted-foreground min-w-0 truncate text-xs" title={entry.id}>
        {loaded
          ? t('llm.extension.semantic.ready', values)
          : t('llm.extension.semantic.stored', values)}
      </p>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label={t('llm.extension.semantic.remove', { name })}
        title={t('llm.extension.semantic.remove', { name })}
        onClick={guardPress(
          `semantic-remove:${entry.id}`,
          () => void useSemanticStore.getState().remove(entry.id),
        )}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}
