import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { t } from '@/i18n';
import type { ToolDefinition } from '@/port/llm-port';

export interface ExpressionToolCardProps {
  readonly definition: ToolDefinition;
  readonly tokens: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function ExpressionToolCard({
  definition,
  tokens,
  open,
  onToggle,
}: ExpressionToolCardProps): React.ReactElement {
  const name = definition.function.name;
  return (
    <div className={cardRow({ enabled: true, dragging: false, locked: true, joinUp: true })}>
      <CardHeader
        label={t('llm.expression.card.title')}
        position={null}
        tokens={tokens}
        summary={name}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open ? (
        <p className="truncate px-1 pt-1" title={JSON.stringify(definition, null, 2)}>
          {name}
        </p>
      ) : null}
    </div>
  );
}
