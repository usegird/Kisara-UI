import { LoaderCircle, MessagesSquare, PanelLeftClose, PanelRightClose, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AdvisorComposer } from '@/components/llm/advisor/AdvisorComposer';
import { AdvisorLog } from '@/components/llm/advisor/AdvisorLog';
import { cardStack, sideDrawer } from '@/components/llm/advisor/side-drawer-style';
import { PlaybookCards } from '@/components/llm/playbook/PlaybookPanel';
import { ColumnDivider } from '@/components/ui/column-divider';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { sessionIdsOf, usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 構成の相談のカードと滑り込む欄。欄は開いている間だけ置き、閉じたら外す（閉じた欄を下の部品の上に残さない）。
// ─────────────────────────────

/** 相談の見出しに使う、最初の発言の 1 行目の長さの上限 */
const HEAD_MAX_CHARS = 80;

/** カードと欄を置く側 */
type AdvisorSide = 'left' | 'right';

/** 相談 1 つに 1 枚のカードを始めた順に縦に重ね、押すと同じ側の端からその相談の欄を滑り込ませる */
export function PromptAdvisor({
  chatId,
  side,
}: {
  readonly chatId: string;
  readonly side: AdvisorSide;
}): React.ReactElement | null {
  const ids = usePromptAdvisorStore(useShallow((state) => sessionIdsOf(state.sessions, chatId)));
  const openId = usePromptAdvisorStore(
    (state) =>
      Object.values(state.sessions).find((session) => session.chatId === chatId && session.isOpen)
        ?.id ?? null,
  );
  // プレイブックのカードは並びの上に重ねる（選んでいるか、選ぶ所を開いている間）
  const chosen = useChatStore((state) => state.chats[chatId]?.playbook !== undefined);
  const choosing = usePlaybookPanelStore((state) => state.open[chatId] === true);
  // 閉じたら、その相談のカードへ焦点を戻す（押した所へ戻すため）
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const cardWidth = useSettingsStore((state) => state.chatCardWidth);
  if (ids.length === 0 && !chosen && !choosing) return null;

  const close = (id: string): void => {
    usePromptAdvisorStore.getState().setOpen(id, false);
    cardButtons.current.get(id)?.focus();
  };

  return (
    <>
      <div className={cardStack({ side })} style={{ width: cardWidth }}>
        {/* 内側の縁を掴んで並びの幅を変える（全体で 1 つ。端末に残す） */}
        <ColumnDivider
          column="chatCards"
          label={t('llm.playbook.cardWidth')}
          width={cardWidth}
          side={side === 'right' ? 'right' : 'left'}
          onResize={(_column, delta) => useSettingsStore.getState().resizeChatCard(delta)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <PlaybookCards chatId={chatId} />
          {ids.map((id) => (
            <AdvisorCard
              key={id}
              id={id}
              attachButton={(element) => {
                if (element === null) cardButtons.current.delete(id);
                else cardButtons.current.set(id, element);
              }}
            />
          ))}
        </div>
      </div>
      {/* 滑り込む途中で横に送れないよう、重ねる層で切り取る。欄は開いている 1 つだけを置く */}
      {openId === null ? null : (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          <AdvisorDrawer
            key={openId}
            id={openId}
            chatId={chatId}
            side={side}
            onClose={() => close(openId)}
          />
        </div>
      )}
    </>
  );
}

/**
 * 相談のカード。名前と、初めに送った発言の頭（受け取り中は印を回す）。押すと欄を開き、× で相談を終える
 */
function AdvisorCard({
  id,
  attachButton,
}: {
  readonly id: string;
  readonly attachButton: (element: HTMLButtonElement | null) => void;
}): React.ReactElement {
  const streaming = usePromptAdvisorStore((state) => state.sessions[id]?.streaming === true);
  // 初めに送った発言の頭だけを読む（本文が届いても描き直さない）
  const head = usePromptAdvisorStore((state) => {
    const first = state.sessions[id]?.messages.find((message) => message.role === 'user');
    return first === undefined
      ? ''
      : (first.content.trim().split('\n', 1)[0]?.slice(0, HEAD_MAX_CHARS) ?? '');
  });
  const store = usePromptAdvisorStore.getState();
  return (
    <div className="bg-background/95 flex items-stretch rounded-md border shadow-sm">
      <button
        ref={attachButton}
        type="button"
        className="hover:bg-muted flex min-w-0 flex-1 items-start gap-2 rounded-l-md px-2 py-1.5
          text-left"
        onClick={() => store.setOpen(id, true)}
      >
        {streaming ? (
          <LoaderCircle
            className="text-muted-foreground mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
            aria-label={t('llm.advisor.streaming')}
          />
        ) : (
          <MessagesSquare className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">{t('llm.advisor.title')}</span>
          <span className="text-muted-foreground truncate text-xs">
            {head.length > 0 ? head : t('llm.advisor.empty')}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex w-7
          shrink-0 items-start justify-center rounded-r-md pt-2"
        aria-label={t('llm.advisor.end')}
        title={t('llm.advisor.end')}
        onClick={() => store.end(id)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** 滑り込む欄。見出し・送る付加情報・初期メッセージ・やり取り・失敗・入力欄 */
function AdvisorDrawer({
  id,
  chatId,
  side,
  onClose,
}: {
  readonly id: string;
  readonly chatId: string;
  readonly side: AdvisorSide;
  readonly onClose: () => void;
}): React.ReactElement {
  const width = useSettingsStore((state) => state.promptAdvisorWidth);
  const streaming = usePromptAdvisorStore((state) => state.sessions[id]?.streaming === true);
  const input = useRef<HTMLTextAreaElement>(null);
  const store = usePromptAdvisorStore.getState();

  // 置いたら入力欄に焦点を移す（焦点という外の仕組みとの同期）
  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <aside
      className={sideDrawer({ side })}
      style={{ width }}
      aria-label={t('llm.advisor.title')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || isComposingKey(event)) return;
        event.preventDefault();
        if (streaming) store.stop(id);
        else onClose();
      }}
    >
      <ColumnDivider
        column="promptAdvisor"
        label={t('llm.advisor.width')}
        width={width}
        side={side}
        onResize={(_column, delta) => useSettingsStore.getState().resizePromptAdvisor(delta)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <MessagesSquare className="text-muted-foreground size-4" aria-hidden />
          <h2 className="flex-1 text-sm font-medium">{t('llm.advisor.title')}</h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
              items-center justify-center rounded-md"
            aria-label={t('llm.advisor.close')}
            title={t('llm.advisor.close')}
            onClick={onClose}
          >
            {/* 欄を置いた側の端へ畳む形 */}
            {side === 'right' ? (
              <PanelRightClose className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        </header>
        <AdvisorLog id={id} chatId={chatId} />
        <AdvisorComposer id={id} streaming={streaming} inputRef={input} />
      </div>
    </aside>
  );
}

/**
 * プロンプトのタブの合計の行の左端に置く、相談を始めるアイコン。まだ送っていない相談があれば開き、
 * 無ければ新しい相談を始める
 */
export function PromptAdvisorStartButton({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7
        shrink-0 items-center justify-center rounded-md"
      aria-label={t('llm.advisor.open')}
      title={t('llm.advisor.open')}
      onClick={() => usePromptAdvisorStore.getState().start(chatId)}
    >
      <MessagesSquare className="size-4" aria-hidden />
    </button>
  );
}
