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

// ─────────────────────────────
// 会話の右の列のプロンプトのタブ。
// ─────────────────────────────

/** 開いている項目の集まりで、Comfy Workflow の行を指す印（項目の id と重ならない） */
const TOOLS_ID = ':tools';

/** 枠も地も付けない文字のリンク */
const LINK = 'text-muted-foreground hover:text-foreground underline underline-offset-2';

/**
 * プリセットの行・見積もりの合計・構成の項目・送る中身を並べる。機能のタブで送るワークフロー（`tools`）も
 * 1 行で見せ、合計に入れる
 */
export function ChatPromptPanel({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement | null {
  // 受け取り中は届く語ごとに会話が作り直される。列が使わない受け取り中の本文だけの違いなら
  // 前の会話のまま描き、項目のカードまで描き直さない
  const chat = useStableContent(
    useChatStore((state) => state.chats[chatId]),
    sameExceptStreamingText,
  );
  const presets = usePresetsStore((state) => state.presets);
  const playbook = useChatPlaybook(chatId);
  const dictionaries = useDictionariesStore((state) => state.dictionaries);
  const enabledIds = useSettingsStore(enabledDictionaryIds);
  // 動的追加辞書を切っていれば、追加辞書の項目を出さず、個別追加辞書も当てない
  const loreOn = useSettingsStore((state) => state.loreDictionariesOn);
  // 打ちかけは空かどうかだけを購読する。見積もりは打ちかけを購読する小さな部品が出す
  // （打つたびに列ごと描き直さない）
  const draftEmpty = useChatStore((state) => (state.drafts[chatId] ?? '').trim().length === 0);
  // 追加辞書の見込みに使う打ちかけ（改行したとき・焦点が外れたときだけ変わる）
  const loreDraft = useChatStore((state) => state.loreDrafts[chatId] ?? '');
  const { context, maxTokens, limit } = useInputLimit();
  const toolsOn = useSettingsStore((state) => state.chatComfyTools);
  const toolTargets = useSettingsStore((state) => state.chatComfyToolTargets);
  const toolEntries = useWorkflowToolsStore((state) => state.entries);
  const toolGuide = useSettingsStore((state) => state.chatComfyToolsArgGuide);
  const squash = useSettingsStore((state) => state.squashSystemMessages);
  const systemPrompt = useSettingsStore((state) => state.llmSystemPrompt);
  // 開いている項目（画面の中だけ。残さない）
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // ⊕ で足したばかりで、名前の欄を開いて出す項目
  const [naming, setNaming] = useState<string | null>(null);
  // 項目を足す・消す操作の取り消し。キーはタブの枠で受ける
  const undoHistory = usePromptHistory(chatId);
  const frame = useRef<HTMLDivElement>(null);
  const toggle = (id: string): void => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    setOpen(next);
  };
  useExpandRequest(chatId, chat, setOpen);
  // 近似判定の見込み。入力欄から焦点が外れたときと送ったときの結果
  const semantic = useSemanticPreview(chatId);
  if (chat === undefined) return null;

  const preset = presetOf(chat, presets);
  // 欄は会話の写しから読む。ロアは全体で有効にした辞書と、会話の個別追加辞書
  const fields = characterOf(chat);
  const library: LoreLibrary = { dictionaries, enabledIds, on: loreOn };
  const books = chatLorebooks(chat);
  const ownLore = loreOn ? ownLoreOf(chat, books) : [];
  const view = characterViewOf(fields, books);
  // 打ちかけのメッセージも、送るときと同じく今回の発言として当てる。まとめる設定・システムプロンプト
  // を変えたら生データと見積もりを描き直す
  const sources = {
    ...sourcesOf(chat, library, { semantic, draft: loreDraft }),
    squashSystem: squash,
    systemPrompt,
    // 自分のプレイブックを直したら描き直す（定義は引いたもの）
    playbook,
  };
  // 送るワークフローの定義（`tools`）も送る中身なので、その JSON の長さで見積もって合計に入れる
  const tools = toolsOn
    ? toChatTools(activeWorkflowTools(toolEntries, toolTargets), chat, toolGuide)
    : [];
  // 上限が分かれば、送るときと同じく古い履歴を外した形で見積もる
  const estimate = estimateChat(chat, chat.prompt, sources, {
    limit,
    tools: estimateTools(tools.map((item) => item.definition)),
  });
  // 追加辞書の一覧は、送るときと同じ条件で当てた結果で作る。発言の件数は今回のメッセージを含める
  const lore: HistoryInput = {
    own: ownLore,
    dictionaries,
    enabledIds,
    hits: chatLoreOf(chat, library, context, { semantic, draft: loreDraft }).hits,
    historyCount: estimate.kept + 1,
    counts: { kept: estimate.kept, dropped: estimate.drop },
  };
  const tokens = new Map<string, React.ReactNode>(estimate.items);
  // メッセージは打ちかけの本文で見積もり、合計にも入れる（送るときはこの本文が入る）
  const input = chat.prompt.items.find((item) => item.marker === 'currentInput');
  if (input !== undefined && !draftEmpty) {
    tokens.set(input.id, <DraftTokens chatId={chatId} ratio={estimate.ratio} />);
  }
  const toolTokens = toolTokensOf(tools, estimate.ratio);
  // 開いたときに 1 件ごとに出す見積もり（その 1 件の定義の JSON の長さ）
  const eachToolTokens = new Map(
    tools.map((item) => [
      item.target.id,
      estimateMessage(JSON.stringify(item.definition), estimate.ratio),
    ]),
  );
  // 打ちかけの分を除いた合計。打ちかけの分は合計の部品が足す
  const totalWithoutDraft = estimate.total + toolTokens;
  const history = chat.prompt.items.find((item) => item.marker === 'chatHistory');
  if (history !== undefined) tokens.set(history.id, estimate.history);
  // 前回の送信が上限を超えていれば（断られた候補の送った数を含む）目立たせる
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
  // メッセージは、打ちかけの本文が無ければ空（灰色の文字にする）
  const summaryFor = (item: PromptItem): ItemSummary =>
    item.marker === 'currentInput'
      ? { ...NONE, text: '', empty: draftEmpty }
      : summaryOf(chat, item, view, lore);
  const onRemoveItem = (id: string): void => {
    undoHistory.record();
    useChatStore.getState().updatePrompt(chatId, (prompt) => removePromptItem(prompt, id));
    // 押した削除のアイコンは行ごと消えるので、焦点をタブの枠へ戻す（続けて Ctrl+Z で戻せるように）
    frame.current?.focus();
  };
  const onNamed = (): void => setNaming(null);
  // 足した項目は会話履歴の手前に入る。開き、名前の欄を「新しい項目」を選んだ状態で出す
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
    // 焦点を受けられる枠にして、枠の中の Ctrl+Z・Ctrl+Y を取り消しに使う
    <div
      ref={frame}
      tabIndex={-1}
      className="flex flex-col gap-3 text-xs outline-none"
      onKeyDown={undoHistory.onKeyDown}
    >
      {/* プリセット・システムプロンプト・Comfy Workflow の行と項目の一覧は、行の間（4px）でつながる 1 つのまとまり */}
      <div className="flex flex-col gap-1">
        {/* プリセットの行の上は 4px */}
        <div className="pt-1">
          <PresetUnitRow chatId={chatId} chat={chat} preset={preset} />
        </div>

        {/* プロンプト構成の見出しと、すべて開く・閉じる */}
        {/* 上下に 8px（行の間 4px に 4px を足す） */}
        <div className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
          <h3 className="font-medium">{t('llm.prompt.composition.title')}</h3>
          <div className="text-muted-foreground flex gap-1">
            <button type="button" className={LINK} onClick={onExpandAllClick}>
              {t('llm.prompt.composition.expandAll')}
            </button>
            {/* 区切りの「/」はリンクにしない */}
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
          // `messages` の外の `tools` なので、`messages` の並びの後ろ（プレフィルの下）に置く。拡張の
          // Comfy Workflow を有効にしていなければ行ごと出さない
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
          // 送る中身を見ると合計は、項目を追加の下に置く
          preview={
            <div className="flex flex-col gap-1">
              <SentPreview chatId={chatId} library={library} semantic={semantic} />
              {/* 左端に構成の相談とプレイブックを始めるアイコン。前回の送信と合計は 1 行ずつ、右に寄せる */}
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
              {/* 合計の下に仕切り線を引き、送る中身に入らないカードの欄を置く */}
              <CardFieldsSection chatId={chatId} />
            </div>
          }
        />
      </div>
    </div>
  );
}

/**
 * 開く頼みを受けて、開いている項目を置き換える。キャラクターカードを読み込んだときだけ、中身のある
 * 有効な項目を開いて出す（描く間に合わせる。プリセットとのリンクは見ない）。相談の案を反映したときは、
 * 変えた行だけを開く。開いたら頼みを外す
 */
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
  // 開いたら頼みを外す（開き直したタブで、もう一度開かないように）
  useEffect(() => {
    if (seq !== null) useChatSidePanelStore.getState().clearExpand();
  }, [seq]);
}

/** キャラクターカードを読み込んだときに開く行（中身のある有効な項目） */
function filledRowsOf(chat: Chat): string[] {
  const card = characterViewOf(characterOf(chat), chatLorebooks(chat));
  return chat.prompt.items
    .filter((item) => item.enabled && isFilledItem(item, card, chat.persona))
    .map((item) => item.id);
}
