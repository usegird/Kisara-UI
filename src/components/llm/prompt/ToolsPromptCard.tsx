import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow } from '@/components/llm/prompt/prompt-card-style';
import { LockMark } from '@/components/llm/prompt/PromptItemCard';
import { t } from '@/i18n';
import type { ActiveWorkflowTool } from '@/store/use-workflow-tools-store';

// ─────────────────────────────
// プロンプトのタブの Comfy Workflow の行。次に `tools` として送るワークフローを読み取り専用で見せる。
// ─────────────────────────────

/** Comfy Workflow の行の props */
export interface ToolsPromptCardProps {
  readonly tools: readonly ActiveWorkflowTool[];
  readonly tokens: number;
  /** 1 件ごとの見積もり。選んだワークフローの id → トークン数 */
  readonly toolTokens: ReadonlyMap<string, number>;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/** 送るワークフローの本数と見積もり。開くと 1 件ごとに機能名とトークン数を出す */
export function ToolsPromptCard({
  tools,
  tokens,
  toolTokens,
  open,
  onToggle,
}: ToolsPromptCardProps): React.ReactElement {
  const empty = tools.length === 0;
  return (
    // プレフィルの行のすぐ下なので、地をつなげる
    <div className={cardRow({ enabled: !empty, dragging: false, locked: true, joinUp: true })}>
      <CardHeader
        label={t('llm.extension.comfy.title')}
        position={null}
        tokens={empty ? undefined : tokens}
        // 送るワークフローが無ければ補足を出さない（行を暗くするだけ）
        summary={empty ? '' : t('llm.prompt.tools.count', { count: tools.length })}
        open={open}
        onToggle={onToggle}
        grip={<LockMark />}
      />
      {open && !empty ? (
        <ul className="flex flex-col gap-1 pt-1">
          {tools.map((item) => (
            <li key={item.target.id} className="flex items-center gap-2 px-1">
              {/* 指すと送る定義（`tools` の 1 件）をそのまま見せる */}
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
