import { ExpressionToolCard } from '@/components/llm/prompt/ExpressionToolCard';
import { ToolsPromptCard } from '@/components/llm/prompt/ToolsPromptCard';
import type { ToolDefinition } from '@/port/llm-port';
import type { ActiveWorkflowTool } from '@/store/use-workflow-tools-store';

export interface PromptToolRowsProps {
  readonly workflows: readonly ActiveWorkflowTool[] | null;
  readonly workflowTokens: number;
  readonly eachWorkflowTokens: ReadonlyMap<string, number>;
  readonly expression: ToolDefinition | null;
  readonly expressionTokens: number;
  readonly workflowOpen: boolean;
  readonly expressionOpen: boolean;
  readonly onWorkflowToggle: () => void;
  readonly onExpressionToggle: () => void;
}

export function PromptToolRows({
  workflows,
  workflowTokens,
  eachWorkflowTokens,
  expression,
  expressionTokens,
  workflowOpen,
  expressionOpen,
  onWorkflowToggle,
  onExpressionToggle,
}: PromptToolRowsProps): React.ReactElement {
  return (
    <>
      {workflows === null ? null : (
        <ToolsPromptCard
          tools={workflows}
          tokens={workflowTokens}
          toolTokens={eachWorkflowTokens}
          open={workflowOpen}
          onToggle={onWorkflowToggle}
        />
      )}
      {expression === null ? null : (
        <ExpressionToolCard
          definition={expression}
          tokens={expressionTokens}
          open={expressionOpen}
          onToggle={onExpressionToggle}
        />
      )}
    </>
  );
}
