import { useId, useState } from 'react';

import { modelUrl, recommendedModel } from '@/chat/semantic-models';
import { FIELD_XS } from '@/components/ui/field';
import { activeLocale, t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 近似判定のカードの一番下の埋め込みモデルの欄。
// ─────────────────────────────

/** 埋め込みモデルの URL の欄。決めたとき近似判定が有効なら読み直す */
export function EmbeddingModelField(): React.ReactElement {
  const id = useId();
  const saved = useSettingsStore((state) => state.embeddingModel);
  // 打ちかけ（この欄だけで持つ。決めたら設定に書く）
  const [value, setValue] = useState(saved);
  const commit = (): void => {
    const next = value.trim();
    setValue(next);
    if (next === saved) return;
    useSettingsStore.getState().setEmbeddingModel(next);
    if (useSettingsStore.getState().loreSemantic) void useSemanticStore.getState().load();
  };
  return (
    <div className="mt-1 flex flex-col gap-1">
      <label className="text-xs" htmlFor={id}>
        {t('llm.settings.embeddingModel')}
      </label>
      <input
        id={id}
        className={`${FIELD_XS} min-w-0`}
        value={value}
        placeholder={modelUrl(recommendedModel(activeLocale()).id)}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          const key = entryKeyOf(event);
          if (key === 'commit') commit();
          if (key === 'cancel') setValue(saved);
        }}
      />
    </div>
  );
}
