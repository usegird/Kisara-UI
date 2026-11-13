import { formatPrice } from '@/components/llm/dialogs/model-price-text';
import { PaneCloseButton } from '@/components/ui/decide-button';
import { t, type MessageKey } from '@/i18n';
import type { ModelDetails, ModelPrice, ModelReasoning } from '@/port/llm-port';

// ─────────────────────────────
// 会話のモデルを選ぶダイアログの右の列。選んだモデルの付帯情報を出す。
// ─────────────────────────────

function reasoningKey(reasoning: ModelReasoning | null, param: boolean): MessageKey {
  if (reasoning?.mandatory === true) return 'llm.modelPicker.info.reasoningMandatory';
  if (reasoning?.defaultEnabled === true) return 'llm.modelPicker.info.reasoningOn';
  if (reasoning?.defaultEnabled === false) return 'llm.modelPicker.info.reasoningOff';
  return reasoning !== null || param
    ? 'llm.modelPicker.info.reasoningSupported'
    : 'llm.modelPicker.info.reasoningNone';
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-muted-foreground font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** 名前と値の表（費用・ベンチマーク・ほかの項目）。横に並べ、幅が足りない行は値を次の行に出す */
function Rows({
  rows,
}: {
  readonly rows: readonly { readonly key: string; readonly name: string; readonly value: string }[];
}): React.ReactElement {
  return (
    <dl className="flex flex-col gap-y-0.5">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-baseline gap-x-3">
          <dt className="font-mono break-all">{row.name}</dt>
          <dd className="min-w-0 tabular-nums break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function priceRows(
  prefix: string,
  prices: readonly ModelPrice[],
): { key: string; name: string; value: string }[] {
  return prices.map((price) => ({
    key: `${prefix}:${price.name}`,
    name: price.name,
    value: formatPrice(price),
  }));
}

/** 選んだモデルの付帯情報の列。無い項目の段は出さない */
export function LlmModelInfo({
  model,
  details,
  onClose,
}: {
  readonly model: string;
  readonly details: ModelDetails;
  /** 情報を閉じる（選んだモデルはそのまま） */
  readonly onClose: () => void;
}): React.ReactElement {
  const reasoning = details.reasoning;
  return (
    <section
      aria-label={t('llm.modelPicker.info.title')}
      className="flex min-h-0 flex-1 flex-col text-xs"
    >
      {/* 見出し: 名前と閉じる ×（中身と一緒に流れない） */}
      <div className="flex items-start gap-2 border-b px-3 py-2">
        <p className="min-w-0 font-mono font-medium break-all">{model}</p>
        <PaneCloseButton label={t('llm.modelPicker.info.close')} onClick={onClose} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {details.prices.length === 0 && details.priceTiers.length === 0 ? null : (
          <Section title={t('llm.modelPicker.info.pricing')}>
            <Rows rows={priceRows('base', details.prices)} />
            {details.priceTiers.map((tier, index) => (
              // 条件の並びは応答の順のまま変わらないので、順番を名前に使う
              <div key={`tier:${String(index)}`} className="mt-1 flex flex-col gap-0.5">
                <p className="text-muted-foreground">
                  {t('llm.modelPicker.info.tier', {
                    conditions: tier.conditions
                      .map((condition) => `${condition.name} ${String(condition.value)}`)
                      .join(' · '),
                  })}
                </p>
                <Rows rows={priceRows(`tier${String(index)}`, tier.prices)} />
              </div>
            ))}
            {/* 一覧の値は参考。正しい金額は提供元の公式サイトで確かめてもらう */}
            <p className="text-muted-foreground mt-1">{t('llm.modelPicker.info.pricingNote')}</p>
          </Section>
        )}

        {details.description === null ? null : (
          <Section title={t('llm.modelPicker.info.description')}>
            {/* LLM の出力と同じく信用しない文字として、Markdown にせずそのまま出す */}
            <p className="whitespace-pre-wrap">{details.description}</p>
          </Section>
        )}

        {details.inputs.length === 0 && details.outputs.length === 0 ? null : (
          <Section title={t('llm.modelPicker.info.modalities')}>
            <p className="font-mono">
              {t('llm.modelPicker.info.modalitiesValue', {
                inputs: details.inputs.join(', ') || '-',
                outputs: details.outputs.join(', ') || '-',
              })}
            </p>
          </Section>
        )}

        <Section title={t('llm.modelPicker.info.reasoning')}>
          <p>{t(reasoningKey(reasoning, details.reasoningParam))}</p>
          {reasoning !== null && reasoning.efforts.length > 0 ? (
            <p className="text-muted-foreground">
              {t('llm.modelPicker.info.efforts', {
                efforts: reasoning.efforts.join(' / '),
                effort: reasoning.defaultEffort ?? '-',
              })}
            </p>
          ) : null}
        </Section>

        {details.benchmarks.length === 0 ? null : (
          <Section title={t('llm.modelPicker.info.benchmarks')}>
            <Rows
              rows={details.benchmarks.map((benchmark) => ({
                key: `${benchmark.source}:${benchmark.label}`,
                name: `${benchmark.source} · ${benchmark.label}`,
                value: benchmark.values
                  .map((item) => `${item.name} ${String(item.value)}`.trim())
                  .join(' · '),
              }))}
            />
          </Section>
        )}

        {details.others.length === 0 ? null : (
          <Section title={t('llm.modelPicker.info.others')}>
            <Rows
              rows={details.others.map((entry) => ({
                key: entry.name,
                name: entry.name,
                value: entry.value,
              }))}
            />
          </Section>
        )}
      </div>
    </section>
  );
}
