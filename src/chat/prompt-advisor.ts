import { EMPTY_CHARACTER } from '@/chat/card';
import { blankDictionaryEntry } from '@/chat/dictionary';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import { outlineStepEntry, stepKey } from '@/chat/playbook-outline';
import {
  addPromptItem,
  removePromptItem,
  updatePrefill,
  updatePromptItem,
  withSourceMarkers,
} from '@/chat/prompt';
import { changedRowsOf, entryRowOf, FIELD_MARKER, rowsOfChange } from '@/chat/prompt-advisor-rows';
import { isReservedBookName } from '@/chat/reserved-book';
import {
  MAIN_PROMPT_ID,
  type CharacterFields,
  type Chat,
  type PromptComposition,
  type PromptItem,
} from '@/chat/types';
import type { Citation, TokenUsage, ToolBilling } from '@/port/llm-port';

// ─────────────────────────────
// 構成の相談の形と、案の当て方（送るのはストア）。渡す指示の本文は prompt-advisor-text.ts、
// 案の読み方は prompt-advisor-parse.ts
// ─────────────────────────────

/** 案を書くコードブロックの言語名 */
export const PROPOSAL_FENCE = 'kisara-prompt';

/** 案で直せるカードの欄 */
export const CHARACTER_FIELDS = [
  'name',
  'description',
  'personality',
  'scenario',
  'mesExample',
  'firstMes',
] as const;

/** 案で直せるカードの欄の名前 */
export type AdvisorCharacterField = (typeof CHARACTER_FIELDS)[number];

/** 案の変える所 1 件 */
export type AdvisorChange =
  | { readonly target: 'main'; readonly content: string }
  | { readonly target: 'item'; readonly id: string; readonly content: string }
  | {
      readonly target: 'newItem';
      readonly name: string;
      readonly place: 'before' | 'after';
      readonly content: string;
    }
  | { readonly target: 'removeItem'; readonly id: string }
  | {
      readonly target: 'character';
      readonly field: AdvisorCharacterField;
      readonly content: string;
    }
  | { readonly target: 'prefill'; readonly content: string }
  | {
      readonly target: 'dictionaryEntry';
      /**
       * 足す先の個別追加辞書の名前（LLM が選ぶ）。書かなければ空
       */
      readonly dictionary: string;
      readonly keys: readonly string[];
      readonly content: string;
      readonly constant: boolean;
      readonly comment: string;
      /**
       * 切って足すか（書かなければ有効）
       */
      readonly enabled: boolean;
    };

/** 読めた案 1 つ。題と、当てる変更の並び */
export interface AdvisorProposal {
  readonly title: string;
  readonly changes: readonly AdvisorChange[];
}

/** 案が当てる値（反映する直前の控えにも使う） */
export type AdvisorTarget = Pick<Chat, 'prompt' | 'character' | 'lorebooks'>;

/** 案が当てる値を会話から読む */
export function advisorTargetOf(chat: Chat): AdvisorTarget {
  return { prompt: chat.prompt, character: chat.character, lorebooks: chat.lorebooks };
}

/** 相談のやり取りの 1 件 */
export interface AdvisorMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  /** サーバーが返した使ったトークン数（LLM の発言だけ。返らなければ持たない） */
  readonly usage?: TokenUsage | undefined;
  /** 思考の本文（LLM の発言だけ。届けば）。送り返さない */
  readonly reasoning?: string | undefined;
  /** 届いた `finish_reason`（LLM の発言だけ。長さで切れたかを見る） */
  readonly finishReason?: string | undefined;
  /**
   * 関数の呼び出し（LLM の発言だけ。届いた順）。案を書かせるツールのものが案のカードになる
   */
  readonly toolCalls?: readonly AdvisorToolCall[] | undefined;
  /**
   * Web 検索・取得の回数と費用（LLM の発言だけ。返ったものだけ）
   */
  readonly billing?: ToolBilling | undefined;
  /**
   * 出典（LLM の発言だけ。URL は重ならない。届いた順。無ければ持たない）
   */
  readonly citations?: readonly Citation[] | undefined;
}

/** 相談の発言が持つ関数の呼び出し 1 件。`id` は受け取り終えるまで空のことがある */
export interface AdvisorToolCall {
  readonly id: string;
  readonly name: string;
  /** 引数の JSON の本文 */
  readonly arguments: string;
}

/**
 * LLM に見せる名前。構成の id・印・カードの欄の名前には SillyTavern から来たものがあるので、送る文では
 * KisaraUI の画面の呼び名に寄せた名前に替え、案を読むときに戻す（ほかのフロントエンドを類推させない）
 */
const SENT_ID: Readonly<Record<string, string>> = {
  chatHistory: 'sessionHistory',
  currentInput: 'messageToSend',
  additionalInfo: 'dictionaryHits',
  personaDescription: 'userProfile',
  charDescription: 'characterDescription',
  charPersonality: 'personalitySummary',
  scenario: 'currentSituation',
  jailbreak: 'afterHistoryInstruction',
  nsfw: 'auxiliaryPrompt',
  enhanceDefinitions: 'definitionBoost',
};

/** カードの欄の、LLM に見せる名前 */
export const SENT_FIELD: Readonly<Record<AdvisorCharacterField, string>> = {
  name: 'assistantName',
  description: 'characterDescription',
  personality: 'personalitySummary',
  scenario: 'currentSituation',
  mesExample: 'dialogueExamples',
  firstMes: 'firstMessage',
};

/** 構成の id・印の、LLM に見せる名前。替えない名前はそのまま */
export const sentId = (id: string): string => SENT_ID[id] ?? id;

/** 送った名前から構成の id に戻す。知らない名前はそのまま */
export function internalId(id: string): string {
  return Object.keys(SENT_ID).find((key) => SENT_ID[key] === id) ?? id;
}

/**
 * 初期メッセージの候補の用途（プロンプト構成が変わる粒度）。`blank` は
 * テンプレートを使わずに新しく作る（用途の勘所を送らない）
 */
export const ADVISOR_USES = ['blank', 'work', 'story', 'roleplay', 'game'] as const;

/** 相談の用途 1 つ */
export type AdvisorUse = (typeof ADVISOR_USES)[number];

/** カードの欄と個別追加辞書を使う用途か（作業はキャラクターを持たない） */
export function usesCard(use: AdvisorUse): boolean {
  return use !== 'work';
}

/**
 * 外から渡す相談の勘所。初期メッセージの候補の代わりに使い、見せる文と送る勘所を
 * 渡す。`outline` があれば、段ごとのプロンプトをその名前の個別追加辞書に書かせる
 */
export interface AdvisorGuide {
  readonly use: AdvisorUse;
  /** 初期メッセージの見せる文 */
  readonly visible: string;
  /** 送る勘所（付加情報に入れる） */
  readonly guide: string;
  /** 段を書かせる個別追加辞書の名前 */
  readonly outline: string | null;
}

/**
 * 案で変えてよい所か。作業ではカードの欄と個別追加辞書を変えさせない。段を書かせる辞書（`outline`）
 * の項目は、どの用途でも変えてよい
 */
function allowsChange(
  use: AdvisorUse,
  change: AdvisorChange,
  outline: string | null = null,
): boolean {
  if (change.target === 'dictionaryEntry' && outline !== null && change.dictionary === outline) {
    return true;
  }
  return usesCard(use) || (change.target !== 'character' && change.target !== 'dictionaryEntry');
}

// ─────────────────────────────
// 案の当て方
// ─────────────────────────────

/**
 * 当てた結果。`applied` は当てた変える所の件数（見つからない項目・印の項目は飛ばす）。
 * `changedRows` はプロンプトのタブで開く行（構成の項目の id と、プレフィル・プレイブックの行の印）
 */
interface AppliedProposal {
  readonly next: AdvisorTarget;
  readonly applied: number;
  readonly changedRows: readonly string[];
}

/**
 * 当てるときに要るもの。足す項目と辞書の id、辞書の名前が書かれず辞書も無いときに作る辞書の名前、
 * 相談の用途
 */
interface ApplyOptions {
  readonly newId: () => string;
  readonly lorebookName: string;
  /** 用途で変えさせない所は飛ばす（渡さなければ絞らない） */
  readonly use?: AdvisorUse | undefined;
  /** 段を書かせる辞書の名前（その辞書の項目は用途に関わらず、段の形で当てる） */
  readonly outline?: string | null | undefined;
  /** 現在の状況の欄を変えない（プレイブックから開いた相談） */
  readonly keepSituation?: boolean | undefined;
}

/** 案を会話の値に当てる */
export function applyProposal(
  target: AdvisorTarget,
  proposal: AdvisorProposal,
  options: ApplyOptions,
): AppliedProposal {
  const { lorebookName, outline = null } = options;
  let { prompt, character, lorebooks } = target;
  const fields: AdvisorCharacterField[] = [];
  const rows = new Set<string>();
  // 足した項目の id を控える（開く行に入れる）
  const newId = (): string => {
    const id = options.newId();
    rows.add(id);
    return id;
  };
  let applied = 0;
  for (const change of proposal.changes) {
    if (skipsChange(change, options)) continue;
    if (change.target === 'character') {
      character = { ...(character ?? EMPTY_CHARACTER), [change.field]: change.content };
      fields.push(change.field);
      applied += 1;
      continue;
    }
    if (change.target === 'dictionaryEntry') {
      // `##` で始まる予約の辞書には、段を書かせる辞書のほかは足さない
      if (isReservedBookName(change.dictionary) && change.dictionary !== outline) continue;
      const naming = { fallbackName: lorebookName, newId: options.newId, outline };
      lorebooks = withLoreEntry(lorebooks ?? [], change, naming);
      rows.add(entryRowOf(change.dictionary, outline));
      applied += 1;
      continue;
    }
    const next = writeToPrompt(prompt, change, newId);
    // 当てられない変える所（無い項目・消せない項目・印の項目）は飛ばす
    if (next === null) continue;
    prompt = next;
    rowsOfChange(change).forEach((row) => rows.add(row));
    applied += 1;
  }
  if (character !== null) prompt = withFieldMarkers(prompt, character, fields);
  const changedRows = changedRowsOf(prompt, rows, fields);
  return { next: { prompt, character, lorebooks }, applied, changedRows };
}

/** 当てない変える所か。用途で変えさせない所と、変えない現在の状況の欄 */
function skipsChange(
  change: AdvisorChange,
  { use, outline = null, keepSituation = false }: ApplyOptions,
): boolean {
  if (use !== undefined && !allowsChange(use, change, outline)) return true;
  // 予約の辞書の名前（`##playbook` など）を構成の項目の名前にした案は足さない（段にならず、毎回送られる）
  if (change.target === 'newItem' && isReservedBookName(change.name.trim())) return true;
  // プレイブックから開いた相談は現在の状況の欄を変えない（段の状況は段の本文）
  return keepSituation && change.target === 'character' && change.field === 'scenario';
}

/** 構成の項目へ当てる。当てられなければ null */
function writeToPrompt(
  prompt: PromptComposition,
  change: Exclude<AdvisorChange, { target: 'character' | 'dictionaryEntry' }>,
  newId: () => string,
): PromptComposition | null {
  switch (change.target) {
    case 'main':
      return writeMain(prompt, change.content);
    case 'item':
      return writeItem(prompt, change.id, change.content);
    case 'newItem': {
      const id = newId();
      const added = addPromptItem(prompt, id, change.place, change.name);
      return updatePromptItem(added, id, { content: change.content }) ?? added;
    }
    case 'removeItem':
      return removePromptItem(prompt, change.id);
    case 'prefill':
      return updatePrefill(prompt, { content: change.content, enabled: true }) ?? prompt;
  }
}

/** メインプロンプトを書く。無ければ構成の先頭に足す */
function writeMain(prompt: PromptComposition, content: string): PromptComposition {
  const written = writeItem(prompt, MAIN_PROMPT_ID, content);
  if (written !== null) return written;
  const main: PromptItem = {
    id: MAIN_PROMPT_ID,
    name: '',
    role: 'system',
    marker: null,
    content,
    enabled: true,
    position: { kind: 'relative' },
  };
  return { ...prompt, items: [main, ...prompt.items] };
}

/** 項目の本文を書く。中身があれば有効にする。印の項目・無い項目は null */
function writeItem(
  prompt: PromptComposition,
  id: string,
  content: string,
): PromptComposition | null {
  const item = prompt.items.find((entry) => entry.id === id);
  if (item === undefined || item.marker !== null) return null;
  const enabled = content.trim().length > 0 ? true : item.enabled;
  return updatePromptItem(prompt, id, { content, enabled }) ?? prompt;
}

/**
 * 個別追加辞書に項目を足す。足す先は LLM が書いた名前の辞書で、無い名前なら その名前で
 * 1 冊足す。名前が無ければ先頭の辞書（無ければ `fallbackName` で作る）。足した辞書は、会話で切って
 * いれば当てるに戻す（足した項目が当たるように）
 */
function withLoreEntry(
  books: readonly OwnLorebook[],
  change: Extract<AdvisorChange, { target: 'dictionaryEntry' }>,
  naming: {
    readonly fallbackName: string;
    readonly newId: () => string;
    readonly outline: string | null;
  },
): OwnLorebook[] {
  const { fallbackName, newId, outline } = naming;
  // アウトラインの辞書の段は、常時（`*, 【段の題】`）・深さ 0・`system` で足す
  const step = outline !== null && change.dictionary === outline;
  const entry: LoreEntry = {
    ...(step ? outlineStepEntry() : blankDictionaryEntry()),
    keys: step ? [stepKey(change)] : change.keys,
    content: change.content,
    constant: step || change.constant,
    comment: change.comment,
    enabled: change.enabled,
  };
  const named = change.dictionary;
  const at = targetBookIndex(books, named);
  if (at < 0) {
    const name = named.length > 0 ? named : fallbackName;
    return [...books, { id: newId(), name, entries: [entry] }];
  }
  return books.map((book, index) =>
    index === at ? { id: book.id, name: book.name, entries: [...book.entries, entry] } : book,
  );
}

/** 項目を足す辞書の位置。名前があればその名前の辞書、無ければ先頭。足す辞書が無ければ -1 */
function targetBookIndex(books: readonly OwnLorebook[], named: string): number {
  if (named.length > 0) return books.findIndex((book) => book.name === named);
  return books.length > 0 ? 0 : -1;
}

/** 欄に中身を入れたら、その印を足すか有効にする */
function withFieldMarkers(
  prompt: PromptComposition,
  character: CharacterFields,
  fields: readonly AdvisorCharacterField[],
): PromptComposition {
  const markers = fields.flatMap((field) => {
    const marker = FIELD_MARKER[field];
    return marker !== undefined && character[field].trim().length > 0 ? [marker] : [];
  });
  if (markers.length === 0) return prompt;
  const added = withSourceMarkers(prompt);
  return {
    ...added,
    items: added.items.map((item) =>
      item.marker !== null && markers.includes(item.marker) ? { ...item, enabled: true } : item,
    ),
  };
}
