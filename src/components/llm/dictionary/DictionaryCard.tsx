import { Pencil } from 'lucide-react';
import { useState } from 'react';

import type { Dictionary } from '@/chat/dictionary';
import {
  pickDictionaryFiles,
  reportDictionaryImport,
} from '@/components/llm/dictionary/dictionary-files';
import { DictionaryDialog } from '@/components/llm/dictionary/DictionaryDialog';
import { SemanticToggle } from '@/components/llm/dictionary/SemanticToggle';
import { CARD_BODY } from '@/components/llm/side-panel/extension-card';
import { SMALL_ICON_BUTTON, smallButton } from '@/components/ui/small-button';
import { t } from '@/i18n';
import { importDictionaryFile, useDictionariesStore } from '@/store/use-dictionaries-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 機能のタブの動的追加辞書のカード。端末にある全体の辞書だけを並べる（個別追加辞書は会話の中にある）。
// ─────────────────────────────

const BUTTON = smallButton();

/** 全体の辞書の並び。全体で有効にした辞書を有効にした順に上へ、ほかは作った時刻の古い順にその下へ */
function orderedDictionaries(
  dictionaries: Readonly<Record<string, Dictionary>>,
  enabledIds: readonly string[],
): Dictionary[] {
  const enabled = enabledIds.flatMap((id) => {
    const dictionary = dictionaries[id];
    return dictionary === undefined ? [] : [dictionary];
  });
  const rest = Object.values(dictionaries)
    .filter((item) => !enabledIds.includes(item.id))
    .sort((a, b) => a.createdAt - b.createdAt);
  return [...enabled, ...rest];
}

/** 全体の辞書を 1 冊 1 行で並べ、全体で有効にする・編集する・作る・取り込む */
export function DictionaryCard(): React.ReactElement {
  const dictionaries = useDictionariesStore((state) => state.dictionaries);
  const enabledIds = useSettingsStore((state) => state.loreDictionaryIds);
  const on = useSettingsStore((state) => state.loreDictionariesOn);
  // 見ている辞書（画面の中だけ）
  const [viewing, setViewing] = useState<string | null>(null);
  const list = orderedDictionaries(dictionaries, enabledIds);
  // 開いている辞書が一覧から消えたら、ダイアログも閉じる
  const viewed = viewing === null ? undefined : dictionaries[viewing];

  return (
    <section className="flex flex-col gap-2 rounded-md border p-2" aria-labelledby="dictionaries">
      {/* カード全体で当てるかを切り替える。切っても 1 冊ずつのチェックは残す */}
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) =>
            useSettingsStore.getState().setLoreDictionariesOn(event.target.checked)
          }
        />
        <span id="dictionaries">{t('llm.extension.dictionary.title')}</span>
      </label>
      <div className={CARD_BODY}>
        <p className="text-muted-foreground text-2xs">{t('llm.extension.dictionary.hint')}</p>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('llm.extension.dictionary.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((dictionary) => (
              <DictionaryRow
                key={dictionary.id}
                dictionary={dictionary}
                enabled={enabledIds.includes(dictionary.id)}
                onView={() => setViewing(dictionary.id)}
              />
            ))}
          </ul>
        )}
        {/* 一覧の末尾に、新しく作る・ファイルを開く */}
        <div className="flex gap-2">
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              const created = useDictionariesStore
                .getState()
                .add(t('llm.extension.dictionary.newName'));
              setViewing(created.id);
            }}
          >
            {t('llm.extension.dictionary.create')}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() =>
              pickDictionaryFiles(true, async (file) =>
                reportDictionaryImport(await importDictionaryFile(file)),
              )
            }
          >
            {t('llm.extension.dictionary.import')}
          </button>
        </div>
        <SemanticToggle />
      </div>
      {viewed === undefined ? null : (
        <DictionaryDialog
          key={viewed.id}
          dictionary={viewed}
          onSave={(patch) => useDictionariesStore.getState().update(viewed.id, patch)}
          onRemove={() => useDictionariesStore.getState().remove(viewed.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

function DictionaryRow({
  dictionary,
  enabled,
  onView,
}: {
  readonly dictionary: Dictionary;
  /** 全体で有効にしているか */
  readonly enabled: boolean;
  readonly onView: () => void;
}): React.ReactElement {
  return (
    <li className="flex items-start gap-1 text-xs">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={enabled}
        aria-label={t('llm.extension.dictionary.enable', { name: dictionary.name })}
        onChange={(event) =>
          useSettingsStore.getState().setLoreDictionaryEnabled(dictionary.id, event.target.checked)
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate">{dictionary.name}</p>
        <p className="text-muted-foreground truncate">
          {t('llm.extension.dictionary.entries', { count: dictionary.entries.length })}
        </p>
      </div>
      <button
        type="button"
        className={SMALL_ICON_BUTTON}
        aria-label={t('llm.extension.dictionary.view', { name: dictionary.name })}
        title={t('llm.extension.dictionary.view', { name: dictionary.name })}
        onClick={onView}
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}
