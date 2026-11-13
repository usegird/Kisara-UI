import {
  SENT_FIELD,
  usesCard,
  type AdvisorMessage,
  type AdvisorProposal,
  type AdvisorToolCall,
  type AdvisorUse,
} from '@/chat/prompt-advisor';
import { parseProposal, splitAdvisorText } from '@/chat/prompt-advisor-parse';
import type { ToolDefinition } from '@/port/llm-port';

// ─────────────────────────────
// 構成の相談の案を書かせるツール。引数の形（JSON Schema）・受け取った呼び出しの読み方・
// 次に送るときに返す結果の文を決める。
// ─────────────────────────────

/** 案を書かせるツールの名前 */
export const ADVISOR_TOOL_NAME = 'propose_prompt_changes';

/** どの用途でも変えられる所 */
const PROMPT_TARGETS = ['main', 'item', 'newItem', 'removeItem', 'prefill'] as const;

/** 呼び出しに返す結果の種類。反映した・まだ反映していない・読めなかった */
export type AdvisorCallStatus = 'applied' | 'pending' | 'invalid';

/** 受け取った呼び出しを読んだもの。読めなければ案は null */
export interface AdvisorCallProposal {
  readonly call: AdvisorToolCall;
  readonly proposal: AdvisorProposal | null;
}

/**
 * 案を書かせるツール。変える所の 1 件は、`target` と変える所ごとの欄を並べた平らな形にする
 * （`oneOf` を受け付けないサーバーがあるため）。`target` とカードの欄は、用途で変えられる所だけを並べる
 */
export function advisorToolOf(use: AdvisorUse, outline: string | null): ToolDefinition {
  const card = usesCard(use);
  const targets = [
    ...PROMPT_TARGETS,
    ...(card ? ['card'] : []),
    ...(card || outline !== null ? ['dictionaryEntry'] : []),
  ];
  return {
    type: 'function',
    function: {
      name: ADVISOR_TOOL_NAME,
      description:
        'Propose changes to the prompt composition. The user reviews the proposal and applies ' +
        'it with a button; nothing changes until then. Use one call per proposal.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short title of the proposal.' },
          changes: { type: 'array', items: changeSchema(targets, card) },
        },
        required: ['title', 'changes'],
      },
    },
  };
}

/** 変える所 1 件の形。どの欄を使うかは target ごとに説明に書く */
function changeSchema(targets: readonly string[], card: boolean): Record<string, unknown> {
  const text = (description: string): Record<string, string> => ({ type: 'string', description });
  return {
    type: 'object',
    properties: {
      target: { type: 'string', enum: targets },
      id: text('item and removeItem: the id of an existing item.'),
      name: text('newItem: the name of the new item.'),
      place: { type: 'string', enum: ['before', 'after'], description: 'newItem: section.' },
      content: text('The new text (not for removeItem). It replaces the whole text.'),
      ...(card
        ? { field: { type: 'string', enum: Object.values(SENT_FIELD), description: 'card.' } }
        : {}),
      dictionary: text('dictionaryEntry: the name of the individual dictionary.'),
      keywords: { type: 'array', items: { type: 'string' }, description: 'dictionaryEntry.' },
      constant: { type: 'boolean', description: 'dictionaryEntry: always sent.' },
      comment: text('dictionaryEntry: a short title of the entry.'),
      enabled: { type: 'boolean', description: 'dictionaryEntry: defaults to true.' },
    },
    required: ['target'],
  };
}

/** 発言の呼び出しのうち、案を書かせるツールのものを読む。ほかの名前の呼び出しは捨てる */
export function advisorCallProposals(
  calls: readonly AdvisorToolCall[] | undefined,
): AdvisorCallProposal[] {
  return (calls ?? [])
    .filter((call) => call.name === ADVISOR_TOOL_NAME)
    .map((call) => ({ call, proposal: parseProposal(call.arguments) }));
}

/** 呼び出しの案の控えの鍵（発言の id と呼び出しの id） */
export function advisorCallKey(messageId: string, callId: string): string {
  return `${messageId}:call:${callId}`;
}

/** 呼び出しに返す結果の種類。読めなければ読めなかった、控えがあれば反映した */
export function advisorCallStatus(call: AdvisorToolCall, applied: unknown): AdvisorCallStatus {
  if (parseProposal(call.arguments) === null) return 'invalid';
  return applied === undefined ? 'pending' : 'applied';
}

/** 呼び出しに返す結果の文（次に送るときの状態で作る） */
export function advisorCallResult(status: AdvisorCallStatus): string {
  switch (status) {
    case 'applied':
      return 'The user applied this proposal.';
    case 'pending':
      return 'Shown to the user as a proposal card. Not applied yet.';
    case 'invalid':
      return (
        'The arguments could not be read as a proposal, so nothing was shown. ' +
        `Call ${ADVISOR_TOOL_NAME} again with {"title", "changes"} as described.`
      );
  }
}

// ─────────────────────────────
// 案の無い応答に置く「決まったことを入れる」。案を出すと言いながら呼び出しを書かないモデルがあり、
// することを名指しで頼むと呼ぶ
// ─────────────────────────────

/** 頼む書き先。個別追加辞書に書ける相談は辞書、ほかはプロンプトの構成 */
export type AdvisorRecordTarget = 'dictionary' | 'composition';

/** 相談の用途と、段を書かせる辞書の名前から、頼む書き先を決める */
export function advisorRecordTargetOf(
  use: AdvisorUse,
  outline: string | null,
): AdvisorRecordTarget {
  return usesCard(use) || outline !== null ? 'dictionary' : 'composition';
}

/** LLM の発言に案が 1 つも無いか（本文の案のブロック・読めない案・呼び出しのどれも無い） */
export function lacksAdvisorProposal(
  message: Pick<AdvisorMessage, 'role' | 'content' | 'toolCalls'>,
): boolean {
  if (message.role !== 'assistant' || message.content.trim().length === 0) return false;
  if (advisorCallProposals(message.toolCalls).length > 0) return false;
  return splitAdvisorText(message.content).every((segment) => segment.kind === 'text');
}
