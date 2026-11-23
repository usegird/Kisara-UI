import { useEffect, useRef, useState } from 'react';

import { PLAYBOOK_ID, PREFILL_ID, SUMMARY_ID, SYSTEM_PROMPT_ID } from '@/chat/assemble';
import { characterOf, chatLorebooks, type LoreLibrary } from '@/chat/chat-sources';
import { sameExceptStreamingText } from '@/chat/edit';
import { addPromptItem, removePromptItem } from '@/chat/prompt';
import { estimateChat, estimateMessage, estimateTools } from '@/chat/tokens';
import type { Chat, PromptItem } from '@/chat/types';
import { PromptAdvisorStartButton } from '@/components/llm/advisor/PromptAdvisorPanel';
import { PlaybookStartButton } from '@/components/llm/playbook/PlaybookPanel';
import { CardFieldsSection } from '@/components/llm/prompt/CardFieldsSection';
import { PresetUnitRow } from '@/components/llm/prompt/PresetUnitRow';
import {
  PREFILL_KEY,
  PromptItemList,
  type ItemSummary,
} from '@/components/llm/prompt/PromptItemList';
import { SUMMARY_KEY } from '@/components/llm/prompt/SummaryCard';
import { SystemPromptCard } from '@/components/llm/prompt/SystemPromptCard';
import { ToolsPromptCard } from '@/components/llm/prompt/ToolsPromptCard';
import {
  DraftTokens,
  LastActual,
  PromptTotal,
  SentPreview,
} from '@/components/llm/side-panel/ChatPromptParts';
import {
  characterViewOf,
  isAdditionalInfo,
  isFilledItem,
  isOverLimit,
  limitDetailOf,
  NONE,
  ownLoreOf,
  playbookRow,
  presetOf,
  summaryOf,
  toolTokensOf,
  type HistoryInput,
} from '@/components/llm/side-panel/prompt-summary';
import { useChatPlaybook } from '@/hooks/chat/use-chat-playbook';
import { useInputLimit } from '@/hooks/chat/use-input-limit';
import { usePromptHistory } from '@/hooks/chat/use-prompt-history';
import { useSemanticPreview } from '@/hooks/chat/use-semantic-preview';
import { useStableContent } from '@/hooks/ui/use-stable-content';
import { t } from '@/i18n';
import { newShortId } from '@/lib/id';
import { useChatSidePanelStore } from '@/store/use-chat-side-panel-store';
import { chatLoreOf, sourcesOf, useChatStore } from '@/store/use-chat-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { usePresetsStore } from '@/store/use-presets-store';
import { enabledDictionaryIds, useSettingsStore } from '@/store/use-settings-store';
import {
  activeWorkflowTools,
  toChatTools,
  useWorkflowToolsStore,
} from '@/store/use-workflow-tools-store';

const TOOLS_ID = ':tools';

const LINK = 'text-muted-foreground hover:text-foreground underline underline-offset-2';

export function ChatPromptPanel({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement | null {
  const chat = useStableContent(
    useChatStore((state) => state.chats[chatId]),
    sameExceptStreamingText,
  );
  const presets = usePresetsStore((state) => state.presets);
  const playbook = useChatPlaybook(chatId);
  const dictionaries = useDictionariesStore((state) => state.dictionaries);
  const enabledIds = useSettingsStore(enabledDictionaryIds);
  const loreOn = useSettingsStore((state) => state.loreDictionariesOn);
  const draftEmpty = useChatStore((state) => (state.drafts[chatId] ?? '').trim().length === 0);
  const loreDraft = useChatStore((state) => state.loreDrafts[chatId] ?? '');
  const { context, maxTokens, limit } = useInputLimit();
  const toolsOn = useSettingsStore((state) => state.chatComfyTools);
  const toolTargets = useSettingsStore((state) => state.chatComfyToolTargets);
  const toolEntries = useWorkflowToolsStore((state) => state.entries);
  const toolGuide = useSettingsStore((state) => state.chatComfyToolsArgGuide);
  const squash = useSettingsStore((state) => state.squashSystemMessages);
  const systemPrompt = useSettingsStore((state) => state.llmSystemPrompt);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [naming, setNaming] = useState<string | null>(null);
  const undoHistory = usePromptHistory(chatId);
  const frame = useRef<HTMLDivElement>(null);
  const toggle = (id: string): void => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    setOpen(next);
  };
  useExpandRequest(chatId, chat, setOpen);
  const semantic = useSemanticPreview(chatId);
  if (chat === undefined) return null;

  const preset = presetOf(chat, presets);
  const fields = characterOf(chat);
  const library: LoreLibrary = { dictionaries, enabledIds, on: loreOn };
  const books = chatLorebooks(chat);
  const ownLore = loreOn ? ownLoreOf(chat, books) : [];
  const view = characterViewOf(fields, books);
  const sources = {
    ...sourcesOf(chat, library, { semantic, draft: loreDraft }),
    squashSystem: squash,
    systemPrompt,
    playbook,
  };
  const tools = toolsOn
    ? toChatTools(activeWorkflowTools(toolEntries, toolTargets), chat, toolGuide)
    : [];
  const estimate = estimateChat(chat, chat.prompt, sources, {
    limit,
    tools: estimateTools(tools.map((item) => item.definition)),
  });
  const lore: HistoryInput = {
    own: ownLore,
    dictionaries,
    enabledIds,
    hits: chatLoreOf(chat, library, context, { semantic, draft: loreDraft }).hits,
    historyCount: estimate.kept + 1,
    counts: { kept: estimate.kept, dropped: estimate.drop },
  };
  const tokens = new Map<string, React.ReactNode>(estimate.items);
  const input = chat.prompt.items.find((item) => item.marker === 'currentInput');
  if (input !== undefined && !draftEmpty) {
    tokens.set(input.id, <DraftTokens chatId={chatId} ratio={estimate.ratio} />);
  }
  const toolTokens = toolTokensOf(tools, estimate.ratio);
  const eachToolTokens = new Map(
    tools.map((item) => [
      item.target.id,
      estimateMessage(JSON.stringify(item.definition), estimate.ratio),
    ]),
  );
  const totalWithoutDraft = estimate.total + toolTokens;
  const history = chat.prompt.items.find((item) => item.marker === 'chatHistory');
  if (history !== undefined) tokens.set(history.id, estimate.history);
  const lastOver = isOverLimit(estimate.lastActual, limit);

  const onExpandAllClick = (): void =>
    setOpen(
      new Set([
        SYSTEM_PROMPT_ID,
        TOOLS_ID,
        SUMMARY_KEY,
        PREFILL_KEY,
        ...chat.prompt.items.map((item) => item.id),
      ]),
    );
  const onCollapseAllClick = (): void => setOpen(new Set());
  const onSystemPromptToggle = (): void => toggle(SYSTEM_PROMPT_ID);
  const onToolsToggle = (): void => toggle(TOOLS_ID);
  const summaryFor = (item: PromptItem): ItemSummary =>
    item.marker === 'currentInput'
      ? { ...NONE, text: '', empty: draftEmpty }
      : summaryOf(chat, item, view, lore);
  const onRemoveItem = (id: string): void => {
    undoHistory.record();
    useChatStore.getState().updatePrompt(chatId, (prompt) => removePromptItem(prompt, id));
    frame.current?.focus();
  };
  const onNamed = (): void => setNaming(null);
  const onAddItem = (): void => {
    undoHistory.record();
    const id = `item-${newShortId()}`;
    const name = t('llm.prompt.newItem');
    useChatStore
      .getState()
      .updatePrompt(chatId, (prompt) => addPromptItem(prompt, id, 'before', name));
    setOpen(new Set(open).add(id));
    setNaming(id);
  };

  return (
    <div
      ref={frame}
      tabIndex={-1}
      className="flex flex-col gap-3 text-xs outline-none"
      onKeyDown={undoHistory.onKeyDown}
    >
      <div className="flex flex-col gap-1">
        <div className="pt-1">
          <PresetUnitRow chatId={chatId} chat={chat} preset={preset} />
        </div>

        <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
          <h3 className="font-medium">{t('llm.prompt.composition.title')}</h3>
          <div className="text-muted-foreground flex gap-1">
            <button type="button" className={LINK} onClick={onExpandAllClick}>
              {t('llm.prompt.composition.expandAll')}
            </button>
            <span aria-hidden>/</span>
            <button type="button" className={LINK} onClick={onCollapseAllClick}>
              {t('llm.prompt.composition.collapseAll')}
            </button>
          </div>
        </div>

        <SystemPromptCard
          tokens={estimate.items.get(SYSTEM_PROMPT_ID)}
          open={open.has(SYSTEM_PROMPT_ID)}
          onToggle={onSystemPromptToggle}
        />

        <PromptItemList
          tools={
            toolsOn ? (
              <ToolsPromptCard
                tools={tools}
                tokens={toolTokens}
                toolTokens={eachToolTokens}
                open={open.has(TOOLS_ID)}
                onToggle={onToolsToggle}
              />
            ) : undefined
          }
          chatId={chatId}
          composition={chat.prompt}
          hidden={loreOn ? undefined : isAdditionalInfo}
          tokens={tokens}
          prefillTokens={estimate.items.get(PREFILL_ID)}
          sessionSummary={{
            count: estimate.summarized,
            tokens: estimate.items.get(SUMMARY_ID),
          }}
          playbook={
            playbook === undefined
              ? undefined
              : playbookRow(playbook, sources, estimate.items.get(PLAYBOOK_ID))
          }
          summary={summaryFor}
          open={open}
          onToggle={toggle}
          onRemove={onRemoveItem}
          naming={naming}
          onNamed={onNamed}
          onAdd={onAddItem}
          preview={
            <div className="flex flex-col gap-1">
              <SentPreview chatId={chatId} library={library} semantic={semantic} />
              <div className="flex items-end justify-between gap-2">
                <div className="flex items-end">
                  <PromptAdvisorStartButton chatId={chatId} />
                  <PlaybookStartButton chatId={chatId} />
                </div>
                <p className="text-muted-foreground flex flex-col items-end px-1 tabular-nums">
                  <LastActual count={estimate.lastActual} over={lastOver} />
                  <PromptTotal
                    chatId={chatId}
                    base={totalWithoutDraft}
                    ratio={estimate.ratio}
                    limit={context === null ? null : limit}
                    detail={limitDetailOf(context, maxTokens)}
                  />
                </p>
              </div>
              <CardFieldsSection chatId={chatId} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function useExpandRequest(
  chatId: string,
  chat: Chat | undefined,
  setOpen: (open: ReadonlySet<string>) => void,
): void {
  const request = useChatSidePanelStore((state) =>
    state.expand?.chatId === chatId ? state.expand : null,
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  if (chat !== undefined && request !== null && expanded !== request.seq) {
    setExpanded(request.seq);
    setOpen(new Set(request.rows ?? filledRowsOf(chat)));
  }
  const seq = request?.seq ?? null;
  useEffect(() => {
    if (seq !== null) useChatSidePanelStore.getState().clearExpand();
  }, [seq]);
}

function filledRowsOf(chat: Chat): string[] {
  const card = characterViewOf(characterOf(chat), chatLorebooks(chat));
  return chat.prompt.items
    .filter((item) => item.enabled && isFilledItem(item, card, chat.persona))
    .map((item) => item.id);
}
