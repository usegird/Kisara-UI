import { cva } from 'class-variance-authority';
import { ChevronLeft, ChevronRight, Route, X } from 'lucide-react';
import { useState } from 'react';

import { currentPhase, enterPhase } from '@/chat/playbook-outline';
import { ICON_BUTTON } from '@/components/llm/playbook/playbook-link';
import {
  FoldedStep,
  OutlineSection,
  PlaybookActionLink,
} from '@/components/llm/playbook/PlaybookCardParts';
import { PlaybookChooser } from '@/components/llm/playbook/PlaybookChooser';
import { PlaybookCommands } from '@/components/llm/playbook/PlaybookCommands';
import { PlaybookResponseUse } from '@/components/llm/playbook/PlaybookResponse';
import { playbookCardId } from '@/components/llm/playbook/use-playbook-action';
import { usePlaybookResponse } from '@/components/llm/playbook/use-playbook-response';
import { useChatPlaybook } from '@/hooks/chat/use-chat-playbook';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// プレイブックのカード。構成の相談のカードと同じ並びに重ね、滑り込む欄は持たずにカードの中身を切り替える。
// ─────────────────────────────

const CARD = 'bg-background/95 flex flex-col rounded-md border shadow-sm';

/** 縮める・広げる三角（広げていれば下を向く） */
const fold = cva('size-4 transition-transform', {
  variants: { open: { true: 'rotate-90', false: '' } },
});

/** カードの並び。選ぶ所を開いていれば選ぶ所だけ、選んでいればプレイブックのカード */
export function PlaybookCards({ chatId }: { readonly chatId: string }): React.ReactElement | null {
  // 定義が見つからない参照（自分のものを消した）は選んでいないものとする
  const chosen = useChatPlaybook(chatId) !== undefined;
  const choosing = usePlaybookPanelStore((state) => state.open[chatId] === true);
  if (choosing) return <ChooserCard chatId={chatId} />;
  if (!chosen) return null;
  return <PhaseCard chatId={chatId} />;
}

/** 選ぶ所のカード。選ぶか × で閉じる */
function ChooserCard({ chatId }: { readonly chatId: string }): React.ReactElement {
  const close = (): void => usePlaybookPanelStore.getState().setOpen(chatId, false);
  return (
    <section
      className={cn(CARD, 'max-h-[60vh]')}
      aria-label={t('llm.playbook.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isComposingKey(event)) return;
        event.preventDefault();
        close();
      }}
    >
      <header className="flex items-center gap-2 border-b px-2 py-1.5">
        <Route className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <h2 className="flex-1 truncate text-sm font-medium">{t('llm.playbook.title')}</h2>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={t('llm.playbook.close')}
          title={t('llm.playbook.close')}
          onClick={close}
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <PlaybookChooser chatId={chatId} onChosen={close} />
    </section>
  );
}

/** プレイブックのカード。今のフェーズと操作、末尾にアウトラインを出し、縮めると見出しとフェーズの行だけ */
function PhaseCard({ chatId }: { readonly chatId: string }): React.ReactElement | null {
  // 会話は参照だけを持つので、定義を引いて描く
  const state = useChatPlaybook(chatId);
  const response = usePlaybookResponse(chatId);
  // 「やめる」で畳んだ候補の応答（応答が替われば出し直す）
  const [dismissed, setDismissed] = useState<string | null>(null);
  const folded = useSettingsStore((settings) => settings.playbookCardFolded);
  if (state === undefined) return null;
  const { playbook } = state;
  const phase = currentPhase(state);
  const at = playbook.phases.findIndex((item) => item.id === phase?.id);
  const move = (delta: number): void => {
    const target = playbook.phases[at + delta];
    if (target !== undefined) {
      useChatStore
        .getState()
        .updatePlaybookChat(chatId, (chat) => enterPhase(chat, playbook, target.id));
    }
  };
  const showResponse = response !== null && response.messageId !== dismissed;
  const picking = showResponse && response.action.use === 'send';
  const buttons = linkActionsOf(phase);
  const foldLabel = folded ? t('llm.playbook.unfold') : t('llm.playbook.fold');
  return (
    <section
      id={playbookCardId(chatId)}
      tabIndex={-1}
      className={cn(CARD, 'outline-none')}
      aria-label={playbook.name}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft') move(-1);
        else if (event.key === 'ArrowRight') move(1);
        else return;
        event.preventDefault();
      }}
    >
      <header className="flex items-center gap-1 px-2 pt-1.5">
        <Route className="text-muted-foreground size-4 shrink-0" aria-hidden />
        {/* 縮める三角はプレイブックのアイコンの右 */}
        <button
          type="button"
          className={ICON_BUTTON}
          aria-expanded={!folded}
          aria-label={foldLabel}
          title={foldLabel}
          onClick={() => useSettingsStore.getState().setPlaybookCardFolded(!folded)}
        >
          <ChevronRight className={fold({ open: !folded })} aria-hidden />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{playbook.name}</h2>
        {/* 確かめずに外す。アウトラインの辞書と記録は残る（もう一度選ぶと引き継ぐ） */}
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={t('llm.playbook.removeNamed', { name: playbook.name })}
          title={t('llm.playbook.remove')}
          onClick={() => useChatStore.getState().setPlaybook(chatId, null)}
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {/* フェーズが 1 つなら移る先が無いので、フェーズの行を置かない */}
      {playbook.phases.length <= 1 ? null : (
        <div className="flex items-center gap-1 px-1.5">
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={at <= 0}
            aria-label={t('llm.playbook.phasePrev')}
            title={t('llm.playbook.phasePrev')}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-xs" aria-live="polite">
            {phaseLineOf(phase, at, playbook.phases.length)}
          </p>
          <button
            type="button"
            className={ICON_BUTTON}
            disabled={at >= playbook.phases.length - 1}
            aria-label={t('llm.playbook.phaseNext')}
            title={t('llm.playbook.phaseNext')}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {folded ? (
        phase === undefined ? null : (
          <FoldedStep chatId={chatId} view={phase.outline} />
        )
      ) : (
        <>
          {/* 目的は、そのフェーズで何をするかを伝える文なので縮めずに出す */}
          {phase === undefined || phase.goal.length === 0 ? null : (
            <p className="text-muted-foreground px-2 text-xs whitespace-pre-wrap">{phase.goal}</p>
          )}
          <div className="flex flex-col gap-2 px-2 py-1.5">
            {picking ? null : (
              <>
                {/* リンクは構成の相談を開く操作と次の段へだけ。送るの操作は「› コマンド」に並べる */}
                {buttons.length === 0 ? null : (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {buttons.map((action, index) => (
                      <PlaybookActionLink
                        key={action.id}
                        chatId={chatId}
                        action={action}
                        primary={index === 0}
                      />
                    ))}
                  </div>
                )}
                {phase === undefined ? null : (
                  <PlaybookCommands chatId={chatId} phase={phase} standing={playbook.standing} />
                )}
              </>
            )}
            {showResponse ? (
              <PlaybookResponseUse
                chatId={chatId}
                state={state}
                response={response}
                onCancel={() => setDismissed(response.messageId)}
              />
            ) : null}
          </div>
          {phase === undefined ? null : <OutlineSection chatId={chatId} view={phase.outline} />}
        </>
      )}
    </section>
  );
}

/** フェーズの行の文（名前と何番目か）。フェーズが無ければ空 */
function phaseLineOf(phase: ReturnType<typeof currentPhase>, at: number, total: number): string {
  if (phase === undefined) return '';
  return `${phase.name} ${t('llm.playbook.count', { i: String(at + 1), n: String(total) })}`;
}

/** カードに並べるリンクの操作。送るの操作は「› コマンド」に並べるので除く */
function linkActionsOf(
  phase: ReturnType<typeof currentPhase>,
): NonNullable<ReturnType<typeof currentPhase>>['actions'] {
  return (phase?.actions ?? []).filter((action) => action.kind !== 'send');
}

/**
 * プロンプトのタブの合計の行で、構成の相談を始めるアイコンの右に置く。選んでいなければ選ぶ所を開き、
 * 選んでいればプレイブックのカードに焦点を移す。機能のタブで切っていて、選んでいなければ出さない
 */
export function PlaybookStartButton({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement | null {
  const on = useSettingsStore((state) => state.playbooksOn);
  const chosen = useChatPlaybook(chatId) !== undefined;
  if (!on && !chosen) return null;
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7
        shrink-0 items-center justify-center rounded-md"
      aria-label={t('llm.playbook.start')}
      title={t('llm.playbook.start')}
      onClick={() => {
        if (!chosen) {
          usePlaybookPanelStore.getState().setOpen(chatId, true);
        } else document.getElementById(playbookCardId(chatId))?.focus();
      }}
    >
      <Route className="size-4" aria-hidden />
    </button>
  );
}
