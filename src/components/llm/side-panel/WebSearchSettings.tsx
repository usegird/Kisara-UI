import { useId, useState } from 'react';

import {
  normalizeSearchEngine,
  SEARCH_ENGINES,
  searchEngineParts,
  WEB_CALLS,
  WEB_CONTENT_TOKENS,
  type SearchEngine,
} from '@/chat/web-tools';
import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { field } from '@/components/ui/field';
import { t, type MessageKey } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// パラメタのタブの末尾の Web 検索の欄。
// ─────────────────────────────

const SELECT = field({ size: 'xs', width: 'control' });
/** 中の欄（名前の列と箱の列）。見出しより薄い色にし、箱は左端を揃える */
const ROWS =
  'text-muted-foreground grid grid-cols-[max-content_max-content] items-center gap-x-2 gap-y-1 px-1';
const NUMBER = field({ size: 'sm' });

const ENGINE_LABEL: Readonly<Record<string, MessageKey>> = {
  off: 'llm.settings.engineOff',
  auto: 'llm.settings.engineAuto',
  exa: 'llm.settings.engineExa',
  parallel: 'llm.settings.engineParallel',
  perplexity: 'llm.settings.enginePerplexity',
};

/** エンジンの名前（無効・自動・OpenRouter も含む） */
function engineName(engine: string): string {
  return t(ENGINE_LABEL[engine] ?? 'llm.settings.engineAuto');
}

/** 検索の選択肢の名前。モードがあれば「エンジン - モード」（モードは API の名前のまま） */
function searchOptionName(option: SearchEngine): string {
  const { engine, mode } = searchEngineParts(option);
  if (engine === null) return engineName(option);
  return mode === null
    ? engineName(engine)
    : t('llm.settings.engineMode', { engine: engineName(engine), mode });
}

function EngineSelect({
  label,
  value,
  engines,
  nameOf,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly engines: readonly string[];
  readonly nameOf: (engine: string) => string;
  readonly onChange: (value: string) => void;
}): React.ReactElement {
  const id = useId();
  // 名前と箱を ROWS の 2 つの列に並べる（箱の左端を揃える）
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {engines.map((engine) => (
          <option key={engine} value={engine}>
            {nameOf(engine)}
          </option>
        ))}
      </select>
    </>
  );
}

/** 数の欄。打ちかけはこの欄だけで持ち、決めたら設定に書く（範囲に収めた値に揃え直す） */
function LimitField({
  label,
  saved,
  range,
  onCommit,
}: {
  readonly label: string;
  readonly saved: number;
  readonly range: { readonly min: number; readonly max: number };
  readonly onCommit: (value: number) => number;
}): React.ReactElement {
  const id = useId();
  const [value, setValue] = useState(String(saved));
  const commit = (): void => {
    const next = Number(value);
    if (value.trim() === '' || !Number.isFinite(next)) {
      setValue(String(saved));
      return;
    }
    setValue(String(onCommit(next)));
  };
  return (
    <>
      <label htmlFor={id} className="font-mono">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={`${NUMBER} w-24 tabular-nums`}
        min={range.min}
        max={range.max}
        step={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          const key = entryKeyOf(event);
          if (key === 'commit') commit();
          if (key === 'cancel') setValue(String(saved));
        }}
      />
    </>
  );
}

/** 使用ツール（検索のエンジンとモードの組）と、手数の上限・取得の本文の上限の欄 */
export function WebSearchSettings(): React.ReactElement {
  const hintId = useId();
  const search = useSettingsStore((state) => state.webSearchEngine);
  const calls = useSettingsStore((state) => state.webSearchMaxCalls);
  const tokens = useSettingsStore((state) => state.webFetchMaxTokens);
  const settings = useSettingsStore.getState();
  return (
    <div className="flex flex-col gap-1" aria-describedby={hintId}>
      <span className={SETTING_HEADING_CLASS}>{t('llm.settings.webSearch')}</span>
      {/* 見出しのすぐ下に、使える接続先の説明 */}
      <p id={hintId} className="text-muted-foreground px-1">
        {t('llm.settings.webSearchHint')}
      </p>
      <div className={ROWS}>
        <EngineSelect
          label={t('llm.settings.webTool')}
          value={search}
          engines={SEARCH_ENGINES}
          nameOf={(option) => searchOptionName(normalizeSearchEngine(option))}
          onChange={(next) => settings.setWebSearchEngine(normalizeSearchEngine(next))}
        />
        <LimitField
          label="max_tool_calls"
          saved={calls}
          range={WEB_CALLS}
          onCommit={(next) => {
            settings.setWebSearchMaxCalls(next);
            return useSettingsStore.getState().webSearchMaxCalls;
          }}
        />
        <LimitField
          label="max_content_tokens"
          saved={tokens}
          range={WEB_CONTENT_TOKENS}
          onCommit={(next) => {
            settings.setWebFetchMaxTokens(next);
            return useSettingsStore.getState().webFetchMaxTokens;
          }}
        />
      </div>
    </div>
  );
}
