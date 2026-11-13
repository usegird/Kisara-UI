import { EMPTY_CHARACTER } from '@/chat/card';
import {
  CHARACTER_FIELDS,
  SENT_FIELD,
  sentId,
  usesCard,
  type AdvisorGuide,
  type AdvisorMessage,
  type AdvisorToolCall,
  type AdvisorUse,
} from '@/chat/prompt-advisor';
import { ADVISOR_TOOL_NAME } from '@/chat/prompt-advisor-tool';
import { sendableArgumentsOf } from '@/chat/tool-arguments';
import type { Chat, PromptItem } from '@/chat/types';
import type { ChatRequestMessage } from '@/port/llm-port';

// ─────────────────────────────
// 構成の相談で LLM に渡す指示の本文と、初期メッセージ・送る `messages` の組み立て。
// ─────────────────────────────

/** コードの囲み（```）の最短の長さ（Markdown の決まり） */
const MIN_FENCE_LENGTH = 3;

/** 用途ごとの勘所（送る文。画面には出さない） */
const USE_GUIDE: Readonly<Record<AdvisorUse, readonly string[]>> = {
  blank: [],
  work: [
    'Use: work such as research, design or writing code. There is no character.',
    'Put the role and the goal into the main prompt, and task rules, thinking steps and the',
    'output format into items. Remove items filled from card fields or the user profile.',
  ],
  roleplay: [
    'Use: role-play with a character.',
    'Put who the character is into the card fields, and how to stay in character into the',
    'main prompt (write only the words and actions of {{char}}; never speak for {{user}}).',
    'Also state the reply length and form in the main prompt, such as how many lines of',
    'dialogue and how much description of actions and scenery per reply.',
    'Keep firstMessage and dialogueExamples to that same length, because replies copy them.',
    'Write characterDescription as short labelled lines:',
    '- Basics: name, age (and how old they look), gender, species if not human. If intimate',
    '  scenes may happen, state that the character is an adult.',
    '- Appearance: 3 to 5 distinctive visual impressions, not a list of measurements.',
    '- Role: position in the setting and the relationship to {{user}}.',
    '- Speech: first-person pronoun, what they call {{user}} and each other character, tone.',
    '- Reactions: how they react when teased, praised or pushed, rather than fixed actions.',
    'Write personalitySummary as a one-line core, one or two flaws, and what they cannot',
    'stand. Do not pile up adjectives or contradicting traits.',
    'Make dialogueExamples the main way to show the voice: a few short lines in different',
    'moods (calm, upset, pleased), and cut descriptions of speech the lines already show.',
    'Keep currentSituation to the present scene. Put background, places and secrets into',
    'the individual dictionary.',
    'If the user gave few details, propose consistent ones that fit the concept and say they',
    'can be changed, or ask a few short questions first.',
  ],
  story: [
    'Use: writing a story together, with the assistant narrating.',
    'Put the narration style, point of view and pacing into the main prompt, the world and',
    'main characters into characterDescription, and the present scene into currentSituation.',
    '{{user}} is the protagonist of the story, not someone the narrator talks with: write the',
    'prompts with {{user}} as the protagonist, never as a dialogue with {{user}} or replies to',
    '{{user}}, and do not create another protagonist.',
    'Let the user steer the plot. Put characters, places and background that appear only',
    'sometimes into the individual dictionary.',
  ],
  game: [
    'Use: running a text game as the game master.',
    'Put the rules, how checks work and how to offer choices into the main prompt, the',
    'setting into characterDescription, and the present state (place, party, items) into',
    'currentSituation. Never decide the actions of the player. Put places, other characters',
    'and secrets into the individual dictionary.',
  ],
};

/** どの用途でも渡す、構成の仕組み */
const BASICS = [
  'This consultation designs the prompt composition of a chat app (KisaraUI).',
  '',
  'How the app builds the request:',
  '- The system prompt of the chat is always sent first. Proposals cannot change it.',
  '  Put the role and the main instructions into the main prompt item (id "main"),',
  '  which is the first item.',
  '- Then the items in order. Items before the session history are sent as system,',
  '  items after it as user, joined to the message to send.',
  '  An item with a depth is inserted into the history N messages from the end.',
  '- Items with "filledFrom" take their content from elsewhere and cannot be edited:',
  '  sessionHistory (past messages), messageToSend (the latest user message),',
  '  dictionaryHits (matched dictionary entries).',
  '- The prefill starts the assistant reply.',
  '- Empty or disabled items are not sent.',
];

/** カードの欄と個別追加辞書を使う用途だけに渡す仕組み */
const CARD_BASICS = [
  '- More "filledFrom" sources: characterDescription / personalitySummary /',
  '  currentSituation / dialogueExamples (card fields), userProfile (the user profile).',
  '- Card fields: assistantName ({{char}}), characterDescription, personalitySummary,',
  '  currentSituation (the current situation only, rewritten per scene; not the whole plot),',
  '  dialogueExamples (short example exchanges), firstMessage (the first message).',
  '- Individual dictionaries hold entries sent only when their keywords appear in recent',
  '  messages (or always if constant). Use them for details not needed every time.',
  '  There can be several, each with a name.',
  '- The variables {{char}} and {{user}} stand for the assistant name and the user name.',
];

/**
 * プレイブックから開いた相談に足す、今の構成を土台にする決まり。勘所の段階は一から作る書き方なので、
 * 既に書いた前提・人物・舞台を作り直させない
 */
const BUILD_ON_CURRENT = [
  '',
  'The chat may already have a composition, card fields and dictionaries (see the current',
  'composition below). Build on them: keep what already fits, reuse the premise, characters',
  'and setting already written instead of creating new ones, and propose changes only for',
  'what is missing or conflicts. If a step above already has its result there, say so in',
  'one line and move on to the next step.',
];

const GUIDELINES = [
  '',
  'Design guidelines:',
  '- Put content that stays the same every time first, and content that changes per',
  '  message or scene later (closer to the history), so servers can reuse the prefix cache.',
  '- Keep each item focused on one purpose. Prefer clear, positive instructions.',
  '- Do not put future plot or secrets into always-sent items.',
  '- Remove items the use does not need.',
  '- If the use is unclear, ask a few short questions before proposing.',
];

const FORMAT = [
  '',
  `To propose changes, call the tool ${ADVISOR_TOOL_NAME} with one JSON object:`,
  '{"title": string, "changes": [change, ...]} (one call per proposal; do not write the call',
  'as text).',
  'Each change is one of:',
  '- {"target": "main", "content": string} (the main prompt; added at the top if missing)',
  '- {"target": "item", "id": existing item id, "content": new text}',
  '- {"target": "newItem", "name": string, "place": "before" | "after", "content": string}',
  '  (added at the end of the section before or after the session history)',
  '- {"target": "removeItem", "id": existing item id}',
  '- {"target": "prefill", "content": string}',
];

const CARD_FIELD_FORMAT = [
  '- {"target": "card", "field": "assistantName" | "characterDescription"',
  '  | "personalitySummary" | "currentSituation" | "dialogueExamples" | "firstMessage",',
  '  "content": string}',
];

const DICTIONARY_FORMAT = [
  '- {"target": "dictionaryEntry", "dictionary": string, "keywords": [string, ...],',
  '  "content": string, "constant": boolean, "comment": string, "enabled": boolean}',
  '  (adds an entry to the individual dictionary with that name; pick the one whose name',
  '  fits the entry, or give a new name to add a new dictionary; "enabled" defaults to true)',
];

const TAIL = [
  'Only these can be changed. You cannot change the system prompt, generation settings',
  'or the order of items.',
  'Prefer filling existing empty items over adding new ones. Content replaces the whole text.',
  'The user applies each proposal with a button, so explain briefly what it changes.',
  'Changes described only in text are not applied: whenever you propose a change, call',
  `${ADVISOR_TOOL_NAME}.`,
  'The result of each call tells whether the user has applied it.',
  'Reply in the same language as the user.',
];

/** 付加情報を埋め込む記法の言語名 */
const CONTEXT_FENCE = 'kisara-context';

/**
 * 初期メッセージに埋め込む付加情報。用途で絞った指示と、今の値。外から渡す勘所が
 * あれば、用途の勘所の後ろにその勘所と段の書き方を足す
 */
export function advisorContextText(
  chat: Chat,
  use: AdvisorUse,
  guide: AdvisorGuide | null = null,
): string {
  const card = usesCard(use);
  const outline = guide?.outline ?? null;
  return [
    ...BASICS,
    ...(card ? CARD_BASICS : []),
    ...(USE_GUIDE[use].length > 0 ? ['', ...USE_GUIDE[use]] : []),
    ...(guide === null || guide.guide.trim().length === 0 ? [] : ['', guide.guide.trim()]),
    ...(guide === null ? [] : BUILD_ON_CURRENT),
    ...GUIDELINES,
    ...FORMAT,
    ...(card ? CARD_FIELD_FORMAT : []),
    ...(card || outline !== null ? DICTIONARY_FORMAT : []),
    ...(outline === null ? [] : outlineFormat(outline)),
    ...TAIL,
    '',
    stateText(chat, use, outline),
  ].join('\n');
}

/**
 * 初期メッセージの本文。見せる文の後ろに、付加情報を言語名 `kisara-context` のコードブロックで
 * 埋め込む。中身に続くバッククォートより長い囲みにして、中身で閉じないようにする
 */
export function advisorGreeting(visible: string, context: string): string {
  const longest = Math.max(0, ...[...context.matchAll(/`+/gu)].map((run) => run[0].length));
  const fence = '`'.repeat(Math.max(MIN_FENCE_LENGTH, longest + 1));
  return `${visible}\n\n${fence}${CONTEXT_FENCE}\n${context}\n${fence}`;
}

/**
 * 相談で送る `messages`。会話と同じくシステムプロンプト（全体の設定。`{{char}}` などは `expand` で
 * 置き換える）を先頭に置き、付加情報を埋め込んだ初期メッセージ（`assistant`）、要約（`system`。
 * 要約した相談だけ）、相談のやり取りの順。空の発言は送らない。案を書かせるツールの呼び出しがある
 * 発言は呼び出しを付けて送り、その後ろに呼び出しごとの結果（`callResult` が作る）を `tool` で置く
 * （ほかの名前の呼び出しは送らない）
 */
export function advisorMessages(
  systemPrompt: string,
  messages: readonly AdvisorMessage[],
  opening: {
    readonly greeting: string;
    readonly summary?: string | undefined;
    readonly callResult?: ((call: AdvisorToolCall, messageId: string) => string) | undefined;
  },
  expand: (text: string) => string = (text) => text,
): ChatRequestMessage[] {
  const system = systemPrompt.trim().length > 0 ? expand(systemPrompt) : '';
  const { greeting, summary = '', callResult = () => '' } = opening;
  return [
    ...(system.length > 0 ? [{ role: 'system' as const, content: system }] : []),
    ...(greeting.trim().length > 0 ? [{ role: 'assistant' as const, content: greeting }] : []),
    ...(summary.trim().length > 0 ? [{ role: 'system' as const, content: summary }] : []),
    ...messages.flatMap((message) => messageParts(message, callResult)),
  ];
}

/** 相談の発言 1 件を送る形。呼び出しがあれば呼び出しと結果、無ければ本文（空なら送らない） */
function messageParts(
  message: AdvisorMessage,
  callResult: (call: AdvisorToolCall, messageId: string) => string,
): ChatRequestMessage[] {
  const calls = (message.toolCalls ?? []).filter((call) => call.name === ADVISOR_TOOL_NAME);
  if (message.role === 'assistant' && calls.length > 0) {
    return [
      {
        role: 'assistant',
        content: message.content.trim().length > 0 ? message.content : null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: sendableArgumentsOf(call.arguments) },
        })),
      },
      ...calls.map((call) => ({
        role: 'tool' as const,
        tool_call_id: call.id,
        content: callResult(call, message.id),
      })),
    ];
  }
  if (message.content.trim().length === 0) return [];
  return [{ role: message.role, content: message.content }];
}

/**
 * 段ごとのプロンプトを辞書に書かせる指示。次の段の項目は送らないので、段の終わりの状態は
 * 次の段の始まりにつながる形で書かせる。勘所は「アウトラインの段」と呼ぶので同じ呼び名で指し、
 * 構成の項目に書かれると段にならないので、ほかの書き先を名指しで断る。この辞書の項目は
 * どれも段になるので、前提や舞台などの常時の項目は別の辞書へ書かせる
 */
function outlineFormat(name: string): string[] {
  return [
    '',
    `Write the outline steps only as dictionary entries of the dictionary "${name}", in a`,
    `${ADVISOR_TOOL_NAME} call. An outline written only as text is not applied and does not`,
    'become steps, so once the user agrees on the sections, make that call (all the steps in',
    'one proposal) instead of writing the outline in prose.',
    `"${name}" is a dictionary, not a prompt item. Write each step as one change of this form:`,
    `{"target": "dictionaryEntry", "dictionary": "${name}", "keywords": ["outline"],`,
    '"constant": true, "enabled": false, "comment": "<step title>", "content": "<instruction>"}',
    'Never put outline steps into main, item, newItem or card fields: those are sent every',
    `time and do not become steps. Every entry of "${name}" becomes a step, so put other`,
    'entries (premise, setting, characters, way of writing) into another dictionary.',
    'Names starting with "##" are reserved: give that other dictionary a plain name.',
    'One entry per step, in the order they are written: "constant": true, "enabled": false,',
    '"keywords": ["outline"],',
    '"comment": a short title of the step, "content": the whole instruction sent while that',
    'step is written. Make each entry self-contained: the goal of the larger section it',
    'belongs to, the situation of the step (place, time, the state just before), what',
    'happens in the step, the state at its end, and not to go into the events of the next',
    'step. Write the state at its end so that it leads into the beginning of the next step',
    '(where people are, what is left open), because the next entry is not sent while this',
    'step is written. Only the current step is turned on, and it is sent right before each reply.',
    'Do not change currentSituation; the situation of each step belongs in its entry.',
  ];
}

/**
 * 今の値を渡す文。送るたびに読む。カードの欄と個別追加辞書は使う用途だけ。段を書かせる辞書は、
 * どの用途でも渡す
 */
function stateText(chat: Chat, use: AdvisorUse, outline: string | null): string {
  const character = chat.character ?? EMPTY_CHARACTER;
  const card = usesCard(use);
  const books = (chat.lorebooks ?? []).filter((book) => card || book.name === outline);
  // 空の欄は渡さない（字下げもしない。送る量を抑える）
  const state = {
    items: chat.prompt.items.map((item) => itemView(chat.prompt.items, item)),
    ...(chat.prompt.prefill.content.length > 0 ? { prefill: chat.prompt.prefill } : {}),
    ...(card
      ? {
          card: Object.fromEntries(
            CHARACTER_FIELDS.flatMap((field) =>
              character[field].length > 0 ? [[SENT_FIELD[field], character[field]]] : [],
            ),
          ),
        }
      : {}),
    ...(card || books.length > 0
      ? {
          individualDictionaries: books.map((book) => ({
            name: book.name,
            entries: book.entries.map((entry) => ({
              keywords: entry.keys,
              content: entry.content,
              ...(entry.constant ? { constant: true } : {}),
              ...(entry.comment.length > 0 ? { comment: entry.comment } : {}),
              ...(entry.enabled ? {} : { enabled: false }),
            })),
          })),
        }
      : {}),
  };
  return `Current composition (JSON):\n${JSON.stringify(state)}`;
}

/** 構成の項目を渡す形。中身を外から入れる項目は出どころだけを渡す */
function itemView(items: readonly PromptItem[], item: PromptItem): Record<string, unknown> {
  const history = items.findIndex((entry) => entry.marker === 'chatHistory');
  const section =
    item.position.kind === 'depth'
      ? `depth ${String(item.position.depth)}`
      : history >= 0 && items.indexOf(item) > history
        ? 'after'
        : 'before';
  return {
    id: sentId(item.id),
    ...(item.name.trim().length > 0 ? { name: item.name } : {}),
    ...(item.marker !== null
      ? { filledFrom: sentId(item.marker) }
      : item.content.length > 0
        ? { content: item.content }
        : {}),
    section,
    enabled: item.enabled,
  };
}
