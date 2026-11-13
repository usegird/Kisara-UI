import { Play } from 'lucide-react';
import { useState } from 'react';

import type { ToolCallGeneration } from '@/chat/types';
import { buildGenerationFigures } from '@/components/llm/message/response-figures';
import { ResponseStatsPanel } from '@/components/llm/message/ResponseStats';
import { CallSentRequestButton } from '@/components/llm/message/SentRequestDialog';
import { argumentLines } from '@/components/llm/message/tool-call-runs';
import { disclosure, rerunButton } from '@/components/llm/message/tool-call-style';
import { field } from '@/components/ui/field';
import { t } from '@/i18n';

// ─────────────────────────────
// ワークフローの呼び出しのカードの畳んだ中身。作らせた応答の情報・思考と、直せる引数。
// 開閉は欄ごとの表示（保存しない）。直した引数はメッセージの部品が持つ。
// ─────────────────────────────

const ARGUMENT_FIELD = `${field({ size: 'xs', width: 'full' })} field-sizing-content max-h-40
  resize-y`;

/** 呼び出しを作らせた応答の情報の props */
export interface GenerationProps {
  readonly chatId: string;
  readonly callId: string;
  readonly generation: ToolCallGeneration;
}

/**
 * 呼び出しを作らせた応答の情報（トークン・時間・費用の 1 行と、右端に送った中身のアイコン）と、
 * その下に畳んだ思考。思考の開閉はこの欄だけの表示（保存しない）
 */
export function Generation({ chatId, callId, generation }: GenerationProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const figures = buildGenerationFigures(generation);
  const reasoning = generation.reasoning;
  const onReasoningClick = (): void => setOpen(!open);
  return (
    <>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          {figures.length === 0 ? null : <ResponseStatsPanel figures={[figures]} />}
        </div>
        <CallSentRequestButton
          chatId={chatId}
          callId={callId}
          className={rerunButton({ busy: false })}
        />
      </div>
      {reasoning.length === 0 ? null : (
        <div className="text-muted-foreground px-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-left"
            aria-expanded={open}
            onClick={onReasoningClick}
          >
            <Play className={disclosure({ open })} aria-hidden />
            {t('llm.chat.reasoning')}
          </button>
          {open ? <p className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{reasoning}</p> : null}
        </div>
      )}
    </>
  );
}

/** 引数の一覧の props */
export interface ArgumentListProps {
  readonly raw: string;
  readonly edits: ReadonlyMap<string, string>;
  readonly onEdit: (name: string, value: string) => void;
}

/** 引数名の下に値の欄。値は欄で直せる（直した値を重ねて出す） */
export function ArgumentList({ raw, edits, onEdit }: ArgumentListProps): React.ReactElement | null {
  const { lines, editable } = argumentLines(raw);
  if (lines.length === 0) return null;
  return (
    <dl className="flex flex-col gap-1">
      {lines.map((line) => {
        const onValueChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void =>
          onEdit(line.name, event.target.value);
        return (
          <div key={line.name} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{line.name}</dt>
            <dd className="min-w-0">
              {editable ? (
                <textarea
                  className={ARGUMENT_FIELD}
                  rows={1}
                  value={edits.get(line.name) ?? line.value}
                  aria-label={t('llm.tool.argument', { name: line.name })}
                  onChange={onValueChange}
                />
              ) : (
                <span className="line-clamp-3 break-words whitespace-pre-wrap">{line.value}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
