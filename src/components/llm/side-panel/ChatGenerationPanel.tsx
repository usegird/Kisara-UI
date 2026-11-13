import { cva } from 'class-variance-authority';

import { SystemPromptSettings } from '@/components/llm/prompt/SystemPromptCard';
import { WebSearchSettings } from '@/components/llm/side-panel/WebSearchSettings';
import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { t } from '@/i18n';
import { stepPowerOfTwo } from '@/lib/power-of-two';
import type { GenerationParams } from '@/port/llm-port';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の右の列のパラメタのタブ。項目の名前は API の名前のまま出す（訳さない）。
// ─────────────────────────────

type NumberKey = Exclude<keyof GenerationParams, 'stop'>;

interface NumberField {
  readonly key: NumberKey;
  /** 決めたときに入れる値 */
  readonly initial: number;
  /** 上下で 2 の累乗へ繰り上げ・繰り下げる */
  readonly powerOfTwo?: true;
  readonly min?: number;
  readonly max?: number;
  readonly step: number;
}

// 長さの上限はいちばんよく触るので先頭に置く
const NUMBER_FIELDS: readonly NumberField[] = [
  { key: 'max_tokens', initial: 1024, min: 1, step: 1, powerOfTwo: true },
  { key: 'temperature', initial: 1, min: 0, max: 2, step: 0.05 },
  { key: 'top_p', initial: 1, min: 0, max: 1, step: 0.01 },
  { key: 'presence_penalty', initial: 0, min: -2, max: 2, step: 0.1 },
  { key: 'frequency_penalty', initial: 0, min: -2, max: 2, step: 0.1 },
  { key: 'seed', initial: 0, step: 1 },
];

const fieldRow = cva('flex flex-col gap-1 rounded-md py-1 pl-1', {
  variants: { set: { true: '', false: 'opacity-55' } },
});

/**
 * システムプロンプトを直す欄と生成の設定の欄。決めていない項目も欄とつまみを薄く出し（送らないことが
 * 見て分かる）、押す・動かす・打つと決めたことにする
 */
export function ChatGenerationPanel({ chatId }: { readonly chatId: string }): React.ReactElement {
  // 生成の設定もシステムプロンプトも全体で 1 つ
  const params = useSettingsStore((state) => state.llmParams);
  const setParam = useSettingsStore((state) => state.setLlmParam);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <SystemPromptSettings />
      {NUMBER_FIELDS.map((field) => {
        const value = params[field.key];
        const set = value !== undefined;
        const id = `param-${chatId}-${field.key}`;
        return (
          <div key={field.key} className={fieldRow({ set })}>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={set}
                aria-label={t(set ? 'llm.generation.reset' : 'llm.generation.set', {
                  name: field.key,
                })}
                onChange={() => setParam(field.key, set ? undefined : field.initial)}
              />
              <label htmlFor={id} className="font-mono">
                {field.key}
              </label>
            </div>
            {/* 決めていない間も欄とつまみを出す（薄く）。押す・動かす・打つと決めたことにする */}
            <div className="flex items-center gap-2">
              {field.min !== undefined && field.max !== undefined ? (
                <input
                  type="range"
                  className="min-w-0 flex-1"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={value ?? field.initial}
                  aria-label={field.key}
                  onPointerDown={() => {
                    if (!set) setParam(field.key, field.initial);
                  }}
                  onChange={(event) => setParam(field.key, Number(event.target.value))}
                />
              ) : null}
              <input
                id={id}
                type="number"
                className="border-input bg-background w-24 rounded-md border px-2 py-0.5
                  tabular-nums"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value ?? field.initial}
                onKeyDown={(event) => {
                  if (field.powerOfTwo !== true) return;
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                  event.preventDefault();
                  const current = value ?? field.initial;
                  setParam(field.key, stepPowerOfTwo(current, event.key === 'ArrowUp' ? 1 : -1));
                }}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (event.target.value === '' || !Number.isFinite(next)) return;
                  // つまみ（1 ずつの上下）は打ち込みと見分け、2 の累乗へ寄せる
                  const typed =
                    (event.nativeEvent as InputEvent).inputType !== undefined &&
                    (event.nativeEvent as InputEvent).inputType !== '';
                  const current = value ?? field.initial;
                  const delta = next - current;
                  if (field.powerOfTwo === true && !typed && Math.abs(delta) === field.step) {
                    setParam(field.key, stepPowerOfTwo(current, delta > 0 ? 1 : -1));
                    return;
                  }
                  setParam(field.key, next);
                }}
              />
            </div>
          </div>
        );
      })}

      <StopField chatId={chatId} stop={params.stop} onChange={(stop) => setParam('stop', stop)} />

      {/* 送る中身の組み立てをモデルに合わせる（全体で 1 つ） */}
      <div className="flex flex-col gap-1">
        <span className={SETTING_HEADING_CLASS}>{t('llm.generation.compatHeading')}</span>
        <SquashField />
      </div>

      {/* Web 検索のエンジンと上限 */}
      <WebSearchSettings />
    </div>
  );
}

/**
 * 隣り合う system のメッセージをまとめて送るか（SillyTavern の Squash system messages）
 */
function SquashField(): React.ReactElement {
  const squash = useSettingsStore((state) => state.squashSystemMessages);
  return (
    <SettingSwitch
      checked={squash}
      onChange={(next) => useSettingsStore.getState().setSquashSystemMessages(next)}
      label={t('llm.generation.squash')}
      spaced={false}
    />
  );
}

function StopField({
  chatId,
  stop,
  onChange,
}: {
  readonly chatId: string;
  readonly stop: readonly string[] | undefined;
  readonly onChange: (stop: readonly string[] | undefined) => void;
}): React.ReactElement {
  const set = stop !== undefined;
  const id = `param-${chatId}-stop`;
  return (
    <div className={fieldRow({ set })}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={set}
          aria-label={t(set ? 'llm.generation.reset' : 'llm.generation.set', { name: 'stop' })}
          onChange={() => onChange(set ? undefined : [])}
        />
        <label htmlFor={id} className="font-mono">
          stop
        </label>
      </div>
      <textarea
        id={id}
        className="border-input bg-background min-h-16 rounded-md border px-2 py-1 font-mono"
        value={stop?.join('\n') ?? ''}
        placeholder={t('llm.generation.stopHint')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    </div>
  );
}
