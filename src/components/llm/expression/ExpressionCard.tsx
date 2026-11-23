import { cva } from 'class-variance-authority';
import { useState } from 'react';

import type { ExpressionMethod } from '@/chat/expression-tool';
import { CARD_BODY } from '@/components/llm/side-panel/extension-card';
import { t, type MessageKey } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

const methodRow = cva('flex items-start gap-1.5', {
  variants: { unavailable: { true: 'cursor-not-allowed', false: '' } },
});

const METHODS: readonly {
  readonly value: ExpressionMethod;
  readonly label: MessageKey;
  readonly hint: MessageKey;
}[] = [
  { value: 'tool', label: 'llm.expression.card.tool', hint: 'llm.expression.card.toolHint' },
  {
    value: 'semantic',
    label: 'llm.expression.card.semantic',
    hint: 'llm.expression.card.semanticHint',
  },
];

export function ExpressionCard(): React.ReactElement {
  const enabled = useSettingsStore((state) => state.chatExpression);
  const method = useSettingsStore((state) => state.chatExpressionMethod);
  const semanticOn = useSettingsStore((state) => state.loreSemantic);
  const [triedSemantic, setTriedSemantic] = useState(false);
  if (semanticOn && triedSemantic) setTriedSemantic(false);
  return (
    <section
      className="flex flex-col gap-2 rounded-md border p-2"
      aria-labelledby="chat-expression"
    >
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => useSettingsStore.getState().setChatExpression(event.target.checked)}
        />
        <span id="chat-expression">{t('llm.expression.card.title')}</span>
      </label>
      <div className={CARD_BODY}>
        <p className="text-muted-foreground text-2xs">{t('llm.expression.card.hint')}</p>
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="mb-1">{t('llm.expression.card.method')}</legend>
          {METHODS.map((item) => {
            const unavailable = item.value === 'semantic' && !semanticOn;
            return (
              <label key={item.value} className={methodRow({ unavailable })}>
                <input
                  type="radio"
                  name="chat-expression-method"
                  className="mt-0.5"
                  checked={method === item.value}
                  aria-disabled={unavailable}
                  onChange={() => {
                    if (unavailable) setTriedSemantic(true);
                    else useSettingsStore.getState().setChatExpressionMethod(item.value);
                  }}
                />
                <span className="flex flex-col">
                  {t(item.label)}
                  <span className="text-muted-foreground text-2xs">{t(item.hint)}</span>
                  {unavailable && triedSemantic ? (
                    <span className="text-destructive text-2xs" role="alert">
                      {t('llm.expression.card.needSemantic')}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </section>
  );
}
