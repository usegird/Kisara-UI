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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { smallButton } from '@/components/ui/small-button';
import { PERCENT } from '@/components/ui/units';
import { activeLocale, t } from '@/i18n';
import { wholeMegabytes } from '@/lib/file-size';
import { guardPress } from '@/lib/press-guard';
import type { StoredEmbeddingModel } from '@/port/embedding-port';
import { useSemanticStore, type SemanticStatus } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 動的追加辞書のカードの中の近似判定。
// ─────────────────────────────

const BUTTON = smallButton({ fade: true });

const ICON_BUTTON = 'hover:bg-muted rounded p-0.5';

/** 状態の 1 行。読めなかったときは失敗の色 */
const statusText = cva('text-xs', {
  variants: { failed: { true: 'text-destructive', false: 'text-muted-foreground' } },
});

/** 状態の文。読み込み中と読めなかったときだけ出す（読めたらモデルの行が「ロード済」になる） */
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

/** 有効にするときに読むモデル（画面の言語の推奨か、設定の指定） */
function targetModel(): SemanticModel {
  return semanticModelFor(activeLocale(), useSettingsStore.getState().embeddingModel);
}

/** 確認に出すモデルと大きさ */
function formatModelConfirm(model: SemanticModel): string {
  return model.size === null
    ? t('llm.extension.semantic.confirmModelUnknown', { name: model.id })
    : t('llm.extension.semantic.confirmModel', { name: model.id, size: model.size });
}

/**
 * 近似判定のチェックと状態、このブラウザに置いたモデルの行。読むモデルが無いときだけ、モデルと大きさを
 * 示して承認を取る。無効にしてもモデルは残す
 */
export function SemanticToggle(): React.ReactElement {
  const enabled = useSettingsStore((state) => state.loreSemantic);
  const status = useSemanticStore((state) => state.status);
  const progress = useSemanticStore((state) => state.progress);
  const error = useSemanticStore((state) => state.error);
  const loadedId = useSemanticStore((state) => state.loadedId);
  const stored = useSemanticStore((state) => state.stored);
  // 確認に出すモデル。出していなければ null
  const [asking, setAsking] = useState<SemanticModel | null>(null);
  const line = enabled ? formatStatus(status, progress, error) : '';

  // 置いたモデルはブラウザの中にあるので、カードを出したときに読み直す
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
    // 落とし済みなら取りに行かないので確かめない
    if (stored.some((entry) => entry.id === model.id)) enable();
    else setAsking(model);
  };

  return (
    <div className="flex flex-col gap-1 border-t pt-2">
      <label className="flex items-center gap-1.5 text-xs font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => toggle(event.target.checked)}
        />
        {t('llm.extension.semantic.title')}
      </label>
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
    </div>
  );
}

/** このブラウザに置いたモデルの 1 行。読んでいれば「ロード済」、ほかは「保存済」。右の × で消す */
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
