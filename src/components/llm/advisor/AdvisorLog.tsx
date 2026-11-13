import { cva } from 'class-variance-authority';
import { Play } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { ADVISOR_USES, type AdvisorGuide } from '@/chat/prompt-advisor';
import { advisorSummarizedCount } from '@/chat/prompt-advisor-summary';
import { advisorContextText } from '@/chat/prompt-advisor-text';
import { advisorRecordTargetOf, lacksAdvisorProposal } from '@/chat/prompt-advisor-tool';
import { AdvisorNearLimit, AdvisorSummaryRow } from '@/components/llm/advisor/AdvisorSummaryParts';
import { PromptAdvisorMessage } from '@/components/llm/advisor/PromptAdvisorMessage';
import { formatLlmFailure } from '@/components/llm/message/failure-text';
import { isNearBottom } from '@/components/llm/message/log-scroll';
import { MarkdownText } from '@/components/llm/message/MarkdownText';
import { ReceivingIndicator } from '@/components/llm/message/ReceivingIndicator';
import { StepSwitch } from '@/components/llm/message/StepSwitch';
import { t } from '@/i18n';
import { guardPress } from '@/lib/press-guard';
import { useChatStore } from '@/store/use-chat-store';
import {
  formatGreeting,
  greetingUse,
  usePromptAdvisorStore,
} from '@/store/use-prompt-advisor-store';

// ─────────────────────────────
// 構成の相談の欄のやり取り（初期メッセージ・発言・受け取りの印・失敗）。
// ─────────────────────────────

const NONE: readonly never[] = [];

/** 枠も地も付けない文字のリンク */
const LINK =
  'text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2';

/** 開く三角（閉じて ▶、開いて ▼） */
const triangle = cva('size-2.5 shrink-0 fill-current transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

/**
 * やり取りの欄。受け取り中は届く語ごとに描き直すので、見出しと入力欄を巻き込まないよう欄だけを分ける。
 * 発言は id で並べ、1 件ずつ自分の発言を購読する（受け取り中でない発言は描き直さない）
 */
export function AdvisorLog({
  id,
  chatId,
}: {
  readonly id: string;
  readonly chatId: string;
}): React.ReactElement {
  const ids = usePromptAdvisorStore(
    useShallow((state) => state.sessions[id]?.messages.map((message) => message.id) ?? NONE),
  );
  const tail = usePromptAdvisorStore(
    (state) => state.sessions[id]?.messages.at(-1)?.content.length ?? 0,
  );
  const streaming = usePromptAdvisorStore((state) => state.sessions[id]?.streaming === true);
  const sentAt = usePromptAdvisorStore((state) => state.sessions[id]?.sentAt);
  const failure = usePromptAdvisorStore((state) => state.sessions[id]?.failure ?? null);
  // 要約が縮めた発言の件数（要約の行を置く位置）
  const summarized = usePromptAdvisorStore((state) => {
    const session = state.sessions[id];
    return session === undefined ? 0 : advisorSummarizedCount(session.messages, session.summary);
  });
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // 末尾を見ているときだけ追いかける
  useEffect(() => {
    const element = log.current;
    if (element !== null && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [tail, ids.length]);

  return (
    <div
      ref={log}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      role="log"
      aria-label={t('llm.advisor.title')}
      // 受け取り中は読み上げを待たせ、書き終えてから 1 回読ませる
      aria-busy={streaming}
      onScroll={(event) => {
        atBottom.current = isNearBottom(event.currentTarget);
      }}
    >
      <Greeting id={id} chatId={chatId} fixed={ids.length > 0} />
      {ids.map((messageId, index) => (
        <Fragment key={messageId}>
          {/* 要約した相談は、縮めずに残した発言の手前に要約の行を置く */}
          {summarized > 0 && index === summarized ? <AdvisorSummaryRow id={id} /> : null}
          <AdvisorMessageItem sessionId={id} chatId={chatId} messageId={messageId} />
        </Fragment>
      ))}
      {/* 受け取り中は回る印と、送ってからの経過時間 */}
      {streaming ? <ReceivingIndicator since={sentAt} /> : null}
      {failure === null ? null : (
        <p role="alert" className="text-destructive text-xs">
          {formatLlmFailure(failure)}
        </p>
      )}
      <AdvisorNearLimit id={id} />
    </div>
  );
}

/** 発言 1 件。自分の発言だけを購読する */
function AdvisorMessageItem({
  sessionId,
  chatId,
  messageId,
}: {
  readonly sessionId: string;
  readonly chatId: string;
  readonly messageId: string;
}): React.ReactElement | null {
  const message = usePromptAdvisorStore((state) =>
    state.sessions[sessionId]?.messages.find((item) => item.id === messageId),
  );
  // 受け取り中の最後の発言か（受け取り中でない発言では変わらない）
  const receiving = usePromptAdvisorStore((state) => {
    const session = state.sessions[sessionId];
    return session?.streaming === true && session.messages.at(-1)?.id === messageId;
  });
  // 受け取りを終えた最後の応答に案が無ければ、決まったことを入れるリンクを添える
  const offersRecord = usePromptAdvisorStore((state) => {
    const session = state.sessions[sessionId];
    if (session === undefined || session.streaming || session.summarizing) return false;
    const last = session.messages.at(-1);
    return last?.id === messageId && lacksAdvisorProposal(last);
  });
  if (message === undefined) return null;
  return (
    <>
      <PromptAdvisorMessage
        sessionId={sessionId}
        chatId={chatId}
        message={message}
        receiving={receiving}
      />
      {offersRecord ? <RecordLink sessionId={sessionId} /> : null}
    </>
  );
}

/**
 * 「決まったことを入れる」。押すと、相談の書き先（辞書か構成）に入れるよう頼む定型の発言を送る
 * （打ちかけは残す）
 */
function RecordLink({ sessionId }: { readonly sessionId: string }): React.ReactElement {
  const target = usePromptAdvisorStore((state) => {
    const session = state.sessions[sessionId];
    const guide = session?.guide ?? null;
    const use = guide?.use ?? greetingUse(session?.greeting ?? 0);
    return advisorRecordTargetOf(use, guide?.outline ?? null);
  });
  const onRecordClick = guardPress(
    `advisor-record:${sessionId}`,
    () => void usePromptAdvisorStore.getState().send(sessionId, t(`llm.advisor.record.${target}`)),
  );
  return (
    <button type="button" className={LINK} onClick={onRecordClick}>
      {t('llm.advisor.record.label')}
    </button>
  );
}

/**
 * 初期メッセージ。用途ごとの候補を会話の候補と同じ ‹ N/M › で選ぶ（左右の矢印キーも同じ）。
 * 本文に埋め込んで送る付加情報は、三角で開け閉めする 1 行にする。1 通送ったら切り替えを出さない
 */
function Greeting({
  id,
  chatId,
  fixed,
}: {
  readonly id: string;
  readonly chatId: string;
  readonly fixed: boolean;
}): React.ReactElement {
  const index = usePromptAdvisorStore((state) => state.sessions[id]?.greeting ?? 0);
  // 外から勘所を渡した相談は、その文を初期メッセージにし、候補を切り替えない
  const guide = usePromptAdvisorStore((state) => state.sessions[id]?.guide ?? null);
  const store = usePromptAdvisorStore.getState();
  const switchable = !fixed && guide === null;
  return (
    <article
      className="flex flex-col gap-1 text-sm"
      aria-label={t('llm.chat.message', { role: t('llm.chat.assistant') })}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!switchable || event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft') store.stepGreeting(id, -1);
        else if (event.key === 'ArrowRight') store.stepGreeting(id, 1);
        else return;
        event.preventDefault();
      }}
    >
      <MarkdownText text={guide?.visible ?? formatGreeting(index)} />
      <EmbeddedContext id={id} chatId={chatId} index={index} guide={guide} />
      {!switchable ? null : (
        <div>
          <StepSwitch
            index={index}
            count={ADVISOR_USES.length}
            onStep={(delta) => store.stepGreeting(id, delta)}
          />
        </div>
      )}
    </article>
  );
}

/** 初期メッセージに埋め込んで送る付加情報。三角で開くと文字のまま出す */
function EmbeddedContext({
  id,
  chatId,
  index,
  guide,
}: {
  readonly id: string;
  readonly chatId: string;
  readonly index: number;
  readonly guide: AdvisorGuide | null;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  // 送った後は初めに送った中身を出す（2 通目からもそれを送る）
  const sent = usePromptAdvisorStore((state) => state.sessions[id]?.sentContext);
  return (
    <div className="text-xs">
      <button
        type="button"
        className="text-muted-foreground hover:bg-accent/50 flex items-center gap-1.5 rounded-sm px-1"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Play className={triangle({ open })} aria-hidden />
        {t('llm.advisor.context')}
      </button>
      {open && sent !== undefined ? <ContextText text={sent} /> : null}
      {open && sent === undefined ? (
        <EmbeddedContextBody chatId={chatId} index={index} guide={guide} />
      ) : null}
    </div>
  );
}

/** 送る前の付加情報。開いている間だけ会話を購読し、構成を直すと中身も変わる（今の値から作る） */
function EmbeddedContextBody({
  chatId,
  index,
  guide,
}: {
  readonly chatId: string;
  readonly index: number;
  readonly guide: AdvisorGuide | null;
}): React.ReactElement | null {
  const chat = useChatStore((state) => state.chats[chatId]);
  if (chat === undefined) return null;
  return <ContextText text={advisorContextText(chat, guide?.use ?? greetingUse(index), guide)} />;
}

/** 付加情報の文字 */
function ContextText({ text }: { readonly text: string }): React.ReactElement {
  return (
    <pre
      className="bg-muted/50 mt-1 max-h-60 overflow-auto rounded-sm p-1.5 font-mono text-3xs
        whitespace-pre-wrap"
    >
      {text}
    </pre>
  );
}
