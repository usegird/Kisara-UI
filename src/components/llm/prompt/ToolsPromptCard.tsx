import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { t } from '@/i18n';
import type { ActiveWorkflowTool } from '@/store/use-workflow-tools-store';

export interface ToolsPromptCardProps {
  readonly tools: readonly ActiveWorkflowTool[];
  readonly tokens: number;
  readonly toolTokens: ReadonlyMap<string, number>;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function ToolsPromptCard({
  tools,
  tokens,
  toolTokens,
  open,
  onToggle,
}: ToolsPromptCardProps): React.ReactElement {
  const empty = tools.length === 0;
  return (
    <div className={cardRow({ enabled: !empty, dragging: false, locked: true, joinUp: true })}>
      <CardHeader
        label={t('llm.extension.comfy.title')}
        position={null}
        tokens={empty ? undefined : tokens}
        summary={empty ? '' : t('llm.prompt.tools.count', { count: tools.length })}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open && !empty ? (
        <ul className="flex flex-col gap-1 pt-1">
          {tools.map((item) => (
            <li key={item.target.id} className="flex items-center gap-2 px-1">
              <span
                className="min-w-0 flex-1 truncate"
                title={JSON.stringify(item.definition, null, 2)}
              >
                {item.tool.name}
              </span>
              <span className="text-muted-foreground shrink-0 pr-1 tabular-nums">
                {toolTokens.get(item.target.id)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
