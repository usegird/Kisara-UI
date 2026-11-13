import { selectedCandidate } from '@/chat/edit';
import { applyMacros, NO_SOURCES, type PromptSources } from '@/chat/macros';
import { playbookText } from '@/chat/playbook-text';
import { inInsertOrder, roleOf } from '@/chat/prompt';
import { sendableArgumentsOf } from '@/chat/tool-arguments';
import { writesReply } from '@/chat/tool-calls';
import { toolResultText } from '@/chat/tool-results';
import type { Chat, ChatMessage, PromptComposition, PromptItem, PromptRole } from '@/chat/types';
import { clamp } from '@/lib/clamp';
import type { ChatRequestMessage, ToolCallRequest } from '@/port/llm-port';

// ─────────────────────────────
// プロンプトの構成から `messages` を、送る時点の会話から毎回組み立てる。
// 項目ごとの見積もりにも使うので、つなぐ前の断片（どの項目から来たか）も返す
// ─────────────────────────────

/**
 * つなぐ前の 1 断片。会話の履歴の発言は `itemId` が null。ワークフローの呼び出しは、
 * `toolCalls` を持つ `assistant` と、呼び出しごとの `tool`（`toolCallId`）に分かれる
 */
interface PromptPart {
  readonly itemId: string | null;
  readonly role: PromptRole | 'tool';
  readonly content: string;
  readonly toolCalls?: readonly ToolCallRequest[] | undefined;
  readonly toolCallId?: string | undefined;
  /**
   * 添えた画像（データ URL。会話の履歴の `user` だけ）
   */
  readonly images?: readonly string[] | undefined;
}

/**
 * 送る要約の形（SillyTavern の Summarize の既定の形）
 */
export function summaryText(content: string): string {
  return `[Summary: ${content.trim()}]`;
}

/**
 * 要約が縮めた発言の件数。受け取る `assistant`（最後のメッセージ）の手前までで数える。
 * 要約が無い・指す発言が履歴に無いなら 0
 */
export function summarizedCount(chat: Chat): number {
  const summary = chat.summary;
  // 本文の空の要約は送らず、縮めた発言をそのまま送る
  if (summary === undefined || summary.content.trim().length === 0) return 0;
  const upTo = summary.upTo;
  return chat.messages.slice(0, -1).findIndex((message) => message.id === upTo) + 1;
}

/** 上限に収めるために外せる発言の件数。要約していない発言のうち、最後の 1 件を除いた数 */
export function droppableCount(chat: Chat): number {
  return Math.max(0, chat.messages.length - 1 - summarizedCount(chat) - 1);
}

/** 断片の `itemId` で会話履歴の要約（画面のセッション要約の行）を指す印（項目の id と重ならない） */
export const SUMMARY_ID = ':summary';

/**
 * 会話履歴の手前に置く要約。縮めた発言が無ければ置かない
 */
function summaryParts(chat: Chat, sources: PromptSources): PromptPart[] {
  if (summarizedCount(chat) === 0) return [];
  const content = summaryText(applyMacros(chat.summary?.content ?? '', sources));
  return [{ itemId: SUMMARY_ID, role: 'system', content }];
}

/**
 * 断片の `itemId` でプレイブックのフェーズの文を指す印（項目の id と重ならない）
 */
export const PLAYBOOK_ID = ':playbook';

/**
 * 会話履歴の手前（要約よりも前）に置くフェーズの文。プレイブックが無ければ置かない。定義は出どころが
 * 引いたものを使う（会話は参照だけを持つ）。アウトラインの段は追加辞書の印から送る
 */
function playbookParts(sources: PromptSources): PromptPart[] {
  if (sources.playbook === undefined) return [];
  return [
    {
      itemId: PLAYBOOK_ID,
      role: 'system',
      content: applyMacros(playbookText(sources.playbook), sources),
    },
  ];
}

/**
 * 受け取る `assistant`（最後のメッセージ）の手前までの発言。空の本文は送らない。
 * 呼び出しを持つ候補は、`toolHistory` なら本文が空でも呼び出しと結果を送り、そうでなければ本文だけを
 * 送る（以降の会話に引数が移らないように。画面と保存は変えない）。要約で縮めた発言は置かず、
 * 要約していない発言を古い方から `drop` 件外す
 */
function historyParts(chat: Chat, sources: PromptSources, drop: number): PromptPart[] {
  const skip = summarizedCount(chat) + clamp(drop, 0, droppableCount(chat));
  return [
    ...chat.messages.slice(skip, -1).flatMap(messageParts(sources)),
    ...revisionParts(chat, sources),
    ...replyParts(chat, sources),
  ];
}

/**
 * 本文を書かせる候補を受け取るときだけ、その候補の呼び出し（本文が空の `assistant`）と今の状態
 * （`tool`）を履歴の末尾に置く。受け取り中の本文（プレフィル）は入れない
 */
function replyParts(chat: Chat, sources: PromptSources): PromptPart[] {
  const last = chat.messages.at(-1);
  const receiving = last === undefined ? undefined : selectedCandidate(last);
  if (last?.role !== 'assistant' || receiving === undefined || !writesReply(receiving)) return [];
  const calls: ChatMessage = { ...last, candidates: [{ ...receiving, content: '' }], selected: 0 };
  return messageParts({ ...sources, toolHistory: true })(calls);
}

/**
 * 指示で作り直す候補を受け取るときだけ、土台の候補の本文（`assistant`）と指示（`user`）を履歴の
 * 末尾に置く。並びは、続けて発言を送るときと同じになる
 */
function revisionParts(chat: Chat, sources: PromptSources): PromptPart[] {
  const last = chat.messages.at(-1);
  const receiving = last === undefined ? undefined : selectedCandidate(last);
  const revision = receiving?.end.kind === 'streaming' ? receiving.revision : undefined;
  if (last?.role !== 'assistant' || revision === undefined) return [];
  const base = last.candidates[revision.base]?.content ?? '';
  return [
    ...(base.length === 0
      ? []
      : [{ itemId: null, role: 'assistant' as const, content: applyMacros(base, sources) }]),
    { itemId: null, role: 'user', content: applyMacros(revision.instruction, sources) },
  ];
}

/** 1 つの発言の断片 */
function messageParts(sources: PromptSources): (message: ChatMessage) => PromptPart[] {
  return (message): PromptPart[] => {
    const candidate = selectedCandidate(message);
    const content = candidate?.content ?? '';
    const calls =
      message.role === 'assistant' && sources.toolHistory === true
        ? (candidate?.toolCalls ?? [])
        : [];
    const text = content.length === 0 ? '' : applyMacros(content, sources);
    const images = message.role === 'user' ? (candidate?.images ?? []) : [];
    if (calls.length === 0) {
      if (text.length === 0 && images.length === 0) return [];
      return [
        {
          itemId: null,
          role: message.role,
          content: text,
          ...(images.length > 0 ? { images } : {}),
        },
      ];
    }
    const toolCalls = calls.map((call): ToolCallRequest => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: sendableArgumentsOf(call.arguments) },
    }));
    return [
      { itemId: null, role: 'assistant', content: text, toolCalls },
      ...calls.map((call): PromptPart => ({
        itemId: null,
        role: 'tool',
        content: toolResultText(call.state),
        toolCallId: call.id,
      })),
    ];
  };
}

/** 呼び出しと結果の間には差し込まない。結果の列の途中なら、列の後ろへずらす */
function outsideToolGroup(history: readonly PromptPart[], slot: number): number {
  let index = slot;
  while (index < history.length && history[index]?.role === 'tool') index += 1;
  return index;
}

function itemText(item: PromptItem, sources: PromptSources): string {
  const raw =
    item.marker === null
      ? (sources.overrideText?.(item.id, item.content) ?? item.content)
      : sources.markerText(item.marker);
  return raw.trim().length === 0 ? '' : applyMacros(raw, sources);
}

function depthOf(item: PromptItem): number {
  return item.position.kind === 'depth' ? item.position.depth : -1;
}

/**
 * 深さの項目を差し込んだ履歴。差し込む場所 b（0〜n）ごとに、同じ深さの中は順の値の小さい方を先に置く。
 * 返すのは「場所 b の手前の発言」と「場所 b の差し込み」を交互に並べたもの
 */
function insertDepthItems(
  history: readonly PromptPart[],
  items: readonly PromptItem[],
  sources: PromptSources,
): PromptPart[][] {
  const n = history.length;
  const slots: PromptPart[][] = Array.from({ length: n + 1 }, () => []);
  const depthItems = inInsertOrder(
    items.filter((item) => item.enabled && item.position.kind === 'depth'),
  );
  for (const item of depthItems) {
    const content = itemText(item, sources);
    if (content.length === 0) continue;
    const slot = outsideToolGroup(history, Math.max(0, n - depthOf(item)));
    slots[slot]?.push({ itemId: item.id, role: item.role, content });
  }
  return slots;
}

/**
 * つなぐ前の断片を並べる。`drop` は上限に収めるため外す履歴の件数
 */
export function assembleParts(
  chat: Chat,
  composition: PromptComposition,
  sources: PromptSources = NO_SOURCES,
  drop = 0,
): PromptPart[] {
  const history = historyParts(chat, sources, drop);
  const slots = insertDepthItems(
    history,
    [...composition.items, ...(sources.extraItems ?? [])],
    sources,
  );
  const flat = (from: number, to: number): PromptPart[] =>
    history.slice(from, to).flatMap((part, index) => [part, ...(slots[from + index + 1] ?? [])]);

  const relative = composition.items.filter(
    (item) => item.enabled && item.position.kind === 'relative',
  );
  const inputMarker = relative.find((item) => item.marker === 'currentInput');
  const last = history.at(-1);
  const moveInput = inputMarker !== undefined && last?.role === 'user';
  // メッセージと、その後ろの深さ 0 の差し込みを印の位置へ移す
  // フェーズの文と要約は履歴の手前、履歴より深い項目よりも前に置く
  const historyBlock = [
    ...playbookParts(sources),
    ...summaryParts(chat, sources),
    ...(slots[0] ?? []),
    ...flat(0, moveInput ? history.length - 1 : history.length),
  ];
  const inputBlock =
    moveInput && last !== undefined ? [last, ...(slots[history.length] ?? [])] : [];

  const parts = itemParts(relative, composition, sources, { historyBlock, inputBlock });
  const prefill = prefillText(composition, sources);
  if (prefill.length > 0) parts.push({ itemId: PREFILL_ID, role: 'assistant', content: prefill });
  return withSystemPrompt(parts, sources);
}

/** 構成の順に、項目の本文と、履歴・今の入力の印の位置の塊を並べる */
function itemParts(
  relative: readonly PromptItem[],
  composition: PromptComposition,
  sources: PromptSources,
  blocks: { readonly historyBlock: PromptPart[]; readonly inputBlock: PromptPart[] },
): PromptPart[] {
  const parts: PromptPart[] = [];
  let inputPlaced = false;
  for (const item of relative) {
    if (item.marker === 'chatHistory') parts.push(...blocks.historyBlock);
    else if (item.marker === 'currentInput') {
      if (!inputPlaced) parts.push(...blocks.inputBlock);
      inputPlaced = true;
    } else {
      const content = itemText(item, sources);
      const role = roleOf(composition.items, item);
      if (content.length > 0) parts.push({ itemId: item.id, role, content });
    }
  }
  return parts;
}

/** システムプロンプトは構成・プリセットと別に、いつも先頭に置く */
function withSystemPrompt(parts: PromptPart[], sources: PromptSources): PromptPart[] {
  const systemPrompt = sources.systemPrompt ?? '';
  const system = systemPrompt.trim().length > 0 ? applyMacros(systemPrompt, sources) : '';
  return system.length > 0
    ? [{ itemId: SYSTEM_PROMPT_ID, role: 'system', content: system }, ...parts]
    : parts;
}

/** 断片の `itemId` でシステムプロンプトを指す印（項目の id と重ならない） */
export const SYSTEM_PROMPT_ID = ':system';

/** 断片の `itemId` でプレフィルを指す印（項目の id と重ならない） */
export const PREFILL_ID = ':prefill';

/** 送るプレフィルの本文。本文が空なら空（プレフィルは無効にしない。本文の有無で決まる） */
export function prefillText(composition: PromptComposition, sources: PromptSources): string {
  const { content } = composition.prefill;
  return content.length > 0 ? applyMacros(content, sources) : '';
}

/** 呼び出しか、その結果か（隣とつながない） */
function isToolPart(part: PromptPart): boolean {
  return part.role === 'tool' || part.toolCalls !== undefined;
}

function toMessage(
  part: PromptPart,
  content: string,
  images: readonly string[],
): ChatRequestMessage {
  if (part.role === 'tool') {
    return { role: 'tool', tool_call_id: part.toolCallId ?? '', content };
  }
  if (part.toolCalls !== undefined) {
    return {
      role: 'assistant',
      content: content.length > 0 ? content : null,
      tool_calls: part.toolCalls,
    };
  }
  if (images.length === 0) return { role: part.role, content };
  // 画像を持つ発言は部品の配列（本文が先、続けて画像。本文が空なら画像だけ）
  return {
    role: part.role,
    content: [
      ...(content.length > 0 ? [{ type: 'text', text: content } as const] : []),
      ...images.map((url) => ({ type: 'image_url', image_url: { url } }) as const),
    ],
  };
}

/**
 * 断片をメッセージにする。既定は断片ごとに 1 つのメッセージ
 * （SillyTavern の既定）。`squash` なら隣り合う `system` だけを改行 1 つでつなぐ（SillyTavern の
 * Squash system messages）。ワークフローの呼び出しと結果はつながない
 */
export function mergeParts(parts: readonly PromptPart[], squash = false): ChatRequestMessage[] {
  const merged: { part: PromptPart; content: string }[] = [];
  for (const part of parts) {
    const previous = merged.at(-1);
    const joinable =
      squash &&
      previous !== undefined &&
      previous.part.role === 'system' &&
      part.role === 'system' &&
      !isToolPart(previous.part) &&
      !isToolPart(part);
    if (joinable) previous.content = `${previous.content}\n${part.content}`;
    else merged.push({ part, content: part.content });
  }
  return merged.map(({ part, content }) => toMessage(part, content, part.images ?? []));
}
