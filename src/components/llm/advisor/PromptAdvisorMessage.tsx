import { cva } from 'class-variance-authority';
import { Play } from 'lucide-react';
import { useState } from 'react';

import type { AdvisorChange, AdvisorMessage, AdvisorProposal } from '@/chat/prompt-advisor';
import { splitAdvisorText } from '@/chat/prompt-advisor-parse';
import { advisorCallKey, advisorCallProposals } from '@/chat/prompt-advisor-tool';
import { CitationList } from '@/components/llm/message/CitationList';
import { MarkdownText } from '@/components/llm/message/MarkdownText';
import { buildResponseFigures } from '@/components/llm/message/response-figures';
import { ResponseStatsPanel } from '@/components/llm/message/ResponseStats';
import { itemLabel } from '@/components/llm/prompt/prompt-text';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { proposalKey, usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// 構成の相談の 1 件。思考の本文・出典・応答の情報は会話と同じ部品で出す。
// ─────────────────────────────

/** 構成の相談の発言 1 件。LLM の本文は Markdown で描き、本文の中の案は案のカードにする */
export function PromptAdvisorMessage({
  sessionId,
  chatId,
  message,
  receiving = false,
}: {
  /** 相談の id（反映の控えを引く） */
  readonly sessionId: string;
  /** 会話の id（項目の名前を引く） */
  readonly chatId: string;
  readonly message: AdvisorMessage;
  /** 受け取り中の発言か（呼び出しの引数が途中） */
  readonly receiving?: boolean;
}): React.ReactElement {
  if (message.role === 'user') {
    return (
      <div className="bg-muted ml-auto max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
        {message.content}
      </div>
    );
  }
  const figures = buildResponseFigures(message.usage, undefined, message.billing);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {message.reasoning === undefined || message.reasoning.length === 0 ? null : (
        <details className="text-muted-foreground max-w-full text-xs">
          <summary className="cursor-pointer select-none">{t('llm.chat.reasoning')}</summary>
          <p className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{message.reasoning}</p>
        </details>
      )}
      {splitAdvisorText(message.content).map((segment, index) => {
        // 本文は流し込みで伸びるだけなので、位置で区別してよい（並べ替えない）
        const key = `${segment.kind}-${String(index)}`;
        switch (segment.kind) {
          case 'text':
            return <MarkdownText key={key} text={segment.text} />;
          case 'proposal': {
            // 本文の中の位置で案を指す（流し込みで前の区切りは変わらない）
            const id = proposalKey(message.id, index);
            return (
              <ProposalCard
                key={key}
                sessionId={sessionId}
                chatId={chatId}
                id={id}
                proposal={segment.proposal}
              />
            );
          }
          case 'invalid':
            return <InvalidProposal key={key} raw={segment.raw} />;
          case 'pending':
            return <PendingProposal key={key} />;
        }
      })}
      {/* 案を書かせるツールの呼び出しは、本文の下に呼び出しの順で案のカードにする */}
      {advisorCallProposals(message.toolCalls).map(({ call, proposal }, index) => {
        // 呼び出しの id は受け取り終えたときに付け直すので、並びの位置で区別する
        const key = `call-${String(index)}`;
        // 受け取り中は引数が途中なので、書いている途中として出す（id も決まっていない）
        if (receiving) return <PendingProposal key={key} />;
        if (proposal === null) return <InvalidProposal key={key} raw={call.arguments} />;
        return (
          <ProposalCard
            key={key}
            sessionId={sessionId}
            chatId={chatId}
            id={advisorCallKey(message.id, call.id)}
            proposal={proposal}
          />
        );
      })}
      {/* 出典 */}
      {message.citations === undefined ? null : <CitationList citations={message.citations} />}
      {/* 応答の情報（Web のツールの回数と、使ったトークン数。費用は会話と同じく開発中だけ） */}
      {figures.length === 0 ? null : <ResponseStatsPanel figures={figures} />}
    </div>
  );
}

/** 変える所 1 件の、どこを変えるか */
function changeLabel(change: AdvisorChange, nameOf: (id: string) => string): string {
  switch (change.target) {
    case 'main':
      return t('llm.advisor.targets.main');
    case 'item':
      return t('llm.advisor.targets.item', { name: nameOf(change.id) });
    case 'newItem':
      return t('llm.advisor.targets.newItem', { name: change.name });
    case 'removeItem':
      return t('llm.advisor.targets.removeItem', { name: nameOf(change.id) });
    case 'prefill':
      return t('llm.advisor.targets.prefill');
    case 'character':
      return t('llm.advisor.targets.character', {
        field: t(`llm.advisor.fields.${change.field}`),
      });
    case 'dictionaryEntry': {
      const keys = change.constant ? t('llm.advisor.constant') : change.keys.join(', ');
      // 足す先の辞書の名前を LLM が書いていれば添える
      return change.dictionary.length > 0
        ? t('llm.advisor.targets.dictionaryEntryIn', { dictionary: change.dictionary, keys })
        : t('llm.advisor.targets.dictionaryEntry', { keys });
    }
  }
}

/** 読めない案。書かれた文字のまま出す */
function InvalidProposal({ raw }: { readonly raw: string }): React.ReactElement {
  return (
    <div className="rounded-md border border-dashed p-2">
      <p className="text-muted-foreground text-xs">{t('llm.advisor.invalid')}</p>
      <pre className="mt-1 max-h-40 overflow-auto font-mono text-3xs whitespace-pre-wrap">{raw}</pre>
    </div>
  );
}

/** 書いている途中の案 */
function PendingProposal(): React.ReactElement {
  return <p className="text-muted-foreground text-xs">{t('llm.advisor.pending')}</p>;
}

/** 変える所 1 件の本文（消すときは無い） */
function changeBody(change: AdvisorChange): string {
  return change.target === 'removeItem' ? '' : change.content;
}

/** 開く三角（閉じて ▶、開いて ▼） */
const triangle = cva('size-2.5 shrink-0 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

/**
 * 案のカード。三角か名前で開くと、変える所ごとに本文の全体を出す。押したときだけ会話に当て、
 * 当てたら元に戻すを出す
 */
function ProposalCard({
  sessionId,
  chatId,
  id,
  proposal,
}: {
  readonly sessionId: string;
  readonly chatId: string;
  readonly id: string;
  readonly proposal: AdvisorProposal;
}): React.ReactElement {
  const applied = usePromptAdvisorStore(
    (state) => state.sessions[sessionId]?.applied[id] !== undefined,
  );
  const items = useChatStore((state) => state.chats[chatId]?.prompt.items);
  const [nothing, setNothing] = useState(false);
  const [open, setOpen] = useState(false);
  const nameOf = (itemId: string): string => {
    const item = items?.find((entry) => entry.id === itemId);
    return item === undefined ? itemId : itemLabel(item);
  };
  const store = usePromptAdvisorStore.getState();
  const title =
    proposal.title.trim().length > 0 ? proposal.title.trim() : t('llm.advisor.untitled');

  return (
    <section className="bg-muted/40 rounded-md border p-2" aria-label={title}>
      <h3 className="text-sm font-medium">
        <button
          type="button"
          className="hover:bg-accent/50 flex w-full items-center gap-1.5 rounded-sm px-1 text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Play className={triangle({ open })} aria-hidden />
          <span className="min-w-0 flex-1">{title}</span>
        </button>
      </h3>
      <ul className="mt-1 flex flex-col gap-1 px-1">
        {proposal.changes.map((change, index) => {
          const body = changeBody(change);
          return (
            // 案は読み直しても同じ並びで、並べ替えない読むだけの列なので、位置で区別してよい
            <li key={`${change.target}-${String(index)}`} className="min-w-0 text-xs">
              <div className="flex min-w-0 gap-2">
                <span className="shrink-0 font-medium">{changeLabel(change, nameOf)}</span>
                {open ? null : (
                  <span className="text-muted-foreground truncate">{body.split('\n', 1)[0]}</span>
                )}
              </div>
              {open && body.length > 0 ? (
                <pre
                  className="bg-background/60 mt-0.5 max-h-60 overflow-auto rounded-sm p-1.5
                    font-sans whitespace-pre-wrap"
                >
                  {body}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-end gap-2">
        {nothing && !applied ? (
          <span className="text-muted-foreground mr-auto text-xs">{t('llm.advisor.nothing')}</span>
        ) : null}
        {applied ? (
          <>
            <span className="text-muted-foreground text-xs">{t('llm.advisor.applied')}</span>
            <Button variant="outline" size="xs" onClick={() => store.revert(sessionId, id)}>
              {t('llm.advisor.revert')}
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => setNothing(store.apply(sessionId, id, proposal) === 0)}>
            {t('llm.advisor.apply')}
          </Button>
        )}
      </div>
    </section>
  );
}
