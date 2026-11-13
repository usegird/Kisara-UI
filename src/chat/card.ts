import type { Lorebook, LoreEntry } from '@/chat/lore';
import { nameSources, type PromptSources } from '@/chat/macros';
import { importedBookName } from '@/chat/reserved-book';
import {
  MAIN_PROMPT_ID,
  POST_HISTORY_ID,
  type CharacterFields,
  type ChatVariable,
  type Persona,
  type PromptComposition,
  type PromptItem,
  type PromptMarker,
  type PromptRole,
} from '@/chat/types';
import { AUTHOR_NOTE_DEPTH, parseCardBook } from '@/chat/world-info';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

// ─────────────────────────────
// プリセットの文字の欄と、キャラクターカードの欄の読み方。ファイルの読み取りは card-read.ts。
// ロアブックはプリセットに持ち、形と当て方は lore.ts、ロアブックの項目の読み取りは world-info.ts
// ─────────────────────────────

/** 送る中身を組むときの欄。会話の写しの欄に、リンクしたプリセットのロアブックを合わせたもの */
export interface CardView extends CharacterFields {
  /** ロアブックの項目（構成の World Info の印を有効で置くかに使う） */
  readonly lorebook: readonly LoreEntry[];
}

/** 中身の無い欄（プリセットを選んでいない会話で、欄を直し始めたとき） */
export const EMPTY_CHARACTER: CharacterFields = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  mesExample: '',
  firstMes: '',
  alternateGreetings: [],
  creatorNotes: '',
  systemPrompt: '',
  postHistoryInstructions: '',
};

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

/** Character's Note の項目のコメント（追加辞書の一覧で見分ける） */
const CHARACTER_NOTE_COMMENT = "Character's Note";

/**
 * Character's Note（カードの `extensions.depth_prompt`）を個別追加辞書の
 * 1 項目にする。常時・深さ N・role。予算を超えても最後まで残るよう優先を高くする。
 * 本文が空なら null
 */
function characterNoteEntry(raw: unknown): LoreEntry | null {
  if (!isRecord(raw) || typeof raw.prompt !== 'string' || raw.prompt.trim() === '') return null;
  return {
    keys: [],
    secondaryKeys: [],
    logic: 'or',
    probability: 100,
    caseSensitive: false,
    content: raw.prompt,
    enabled: true,
    constant: true,
    side: 'after',
    depth: {
      depth: Math.max(0, Math.trunc(finiteNumber(raw.depth) ?? AUTHOR_NOTE_DEPTH)),
      role: ROLES.find((role) => role === raw.role) ?? 'system',
    },
    historyStart: false,
    scanDepth: null,
    order: 100,
    priority: Number.MAX_SAFE_INTEGER,
    comment: CHARACTER_NOTE_COMMENT,
  };
}

/** 個別追加辞書に Character's Note の項目を足す。項目が無ければ同じ辞書 */
function withCharacterNote(book: Lorebook | null, note: LoreEntry | null): Lorebook | null {
  if (note === null) return book;
  return { name: book?.name ?? '', entries: [...(book?.entries ?? []), note] };
}

/** そろえたカードの個別追加辞書（`character_book` と Character's Note）。どちらも無ければ null */
export function cardLorebook(card: Record<string, unknown>): Lorebook | null {
  const book = cardBook(card);
  const entries = parseCardBook(book);
  // 予約の名前（##）で始まれば先頭の # を外す
  const name = typeof book?.name === 'string' ? importedBookName(book.name) : '';
  const data = isRecord(card.data) ? card.data : {};
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const base = entries.length === 0 && name.length === 0 ? null : { name, entries };
  return withCharacterNote(base, characterNoteEntry(extensions.depth_prompt));
}

/** そろえたカードから、プリセットの文字の欄を引き出す（使わない項目は落とす） */
export function cardFields(card: Record<string, unknown>): CharacterFields {
  const data = isRecord(card.data) ? card.data : {};
  const nickname = card.spec === 'chara_card_v3' ? stringOr(data.nickname).trim() : '';
  const greetings = isUnknownArray(data.alternate_greetings) ? data.alternate_greetings : [];
  return {
    name: nickname.length > 0 ? nickname : stringOr(data.name),
    description: stringOr(data.description),
    personality: stringOr(data.personality),
    scenario: stringOr(data.scenario),
    mesExample: stringOr(data.mes_example),
    firstMes: stringOr(data.first_mes),
    alternateGreetings: greetings.filter((item): item is string => typeof item === 'string'),
    creatorNotes: stringOr(data.creator_notes),
    systemPrompt: stringOr(data.system_prompt),
    postHistoryInstructions: stringOr(data.post_history_instructions),
  };
}

/** そろえたカードのロアブック（`character_book`）。無ければ null */
function cardBook(card: Record<string, unknown>): Readonly<Record<string, unknown>> | null {
  const data = isRecord(card.data) ? card.data : {};
  return isRecord(data.character_book) ? data.character_book : null;
}

/** 写しの欄とロアブックの項目から、送る中身を組むときの欄を作る */
export function characterView(
  fields: CharacterFields,
  lorebook: readonly LoreEntry[] = [],
): CardView {
  return { ...fields, lorebook };
}

/**
 * 置き場に書いた欄を読む（プリセットと会話の写し）。読めなければ null
 */
export function parseCharacterFields(raw: unknown): CharacterFields | null {
  if (!isRecord(raw)) return null;
  return {
    name: stringOr(raw.name),
    description: stringOr(raw.description),
    personality: stringOr(raw.personality),
    scenario: stringOr(raw.scenario),
    mesExample: stringOr(raw.mesExample),
    firstMes: stringOr(raw.firstMes),
    alternateGreetings: stringArray(raw.alternateGreetings),
    creatorNotes: stringOr(raw.creatorNotes),
    systemPrompt: stringOr(raw.systemPrompt),
    postHistoryInstructions: stringOr(raw.postHistoryInstructions),
    ...variablesOf(raw.variables),
  };
}

/** 保存した変数を読む。名前の無い行も残す（画面で書きかけの行）。1 つも無ければ持たない */
function variablesOf(raw: unknown): { readonly variables?: readonly ChatVariable[] } {
  if (!isUnknownArray(raw)) return {};
  const variables = raw.filter(isRecord).map((item, index) => ({
    // 識別の無い行は位置から作る（読むたびに同じになる）
    id: stringOr(item.id) || `v${String(index)}`,
    name: stringOr(item.name),
    value: stringOr(item.value),
    ...(item.restore === true ? { restore: true as const } : {}),
  }));
  return variables.length === 0 ? {} : { variables };
}

/**
 * プリセットから来る印の中身
 */
export function cardMarkerText(view: CharacterFields, marker: PromptMarker): string {
  switch (marker) {
    case 'charDescription':
      return view.description;
    case 'charPersonality':
      return view.personality;
    case 'scenario':
      return view.scenario;
    case 'dialogueExamples':
      return view.mesExample;
    default:
      return '';
  }
}

/**
 * プリセットから送る中身の出どころを作る。置き換えは構成の
 * 「プリセットの置き換えを使う」が有効で、カードの本文が空でないときだけ。`{{original}}` は元の本文。
 * ロアは含めない（lore.ts の `withLore` で足す）
 */
export function presetSources(
  view: CharacterFields,
  composition: PromptComposition,
  names: PromptSources = nameSources(view, null),
): PromptSources {
  const overrides: Readonly<Record<string, string>> = composition.usePresetOverrides
    ? { [MAIN_PROMPT_ID]: view.systemPrompt, [POST_HISTORY_ID]: view.postHistoryInstructions }
    : {};
  return {
    userName: names.userName,
    charName: names.charName,
    variables: names.variables,
    markerText: (marker) => cardMarkerText(view, marker),
    overrideText: (itemId, original) => {
      const text = overrides[itemId] ?? '';
      return text.trim().length === 0 ? null : text.replace(/\{\{original\}\}/gi, original);
    },
  };
}

/**
 * カードから開いた会話で、その印に中身があるか（読み込んだときに開いて出すか）。会話の履歴・
 * メッセージ・追加辞書の印はいつもある扱い
 */
export function markerHasContent(
  view: CardView,
  marker: PromptMarker,
  persona: Persona | null,
): boolean {
  if (marker === 'chatHistory' || marker === 'currentInput' || marker === 'additionalInfo') {
    return true;
  }
  // 利用者の情報はカードに無い。会話に説明があれば有効にする（選び直しで落とさない）
  if (marker === 'personaDescription') return (persona?.description.trim() ?? '') !== '';
  return cardMarkerText(view, marker).trim() !== '';
}

/**
 * カードから開いた会話の構成。KisaraUI の初めの構成の項目は使わず、
 * カードにある欄を SillyTavern の既定の並びで置く。名前は SillyTavern の画面の名前。
 * 項目はどれも有効で置く（中身の無い欄は送らない）。
 * メインプロンプトと履歴後の指示は欄に中身があるときだけ、普通の文面の項目として置く
 */
export function cardComposition(view: CardView): PromptComposition {
  const relative = { kind: 'relative' } as const;
  // 本文は置かず、送るときに欄の中身で置き換える（presetSources）。欄が空なら項目を置かない
  const textItems = (id: string, content: string): PromptItem[] =>
    content.trim().length === 0
      ? []
      : [
          {
            id,
            name: '',
            role: 'system',
            marker: null,
            content: '',
            enabled: true,
            position: relative,
          },
        ];
  const marker = (id: PromptMarker, role: PromptRole = 'system'): PromptItem => ({
    id,
    name: '',
    role,
    marker: id,
    content: '',
    enabled: true,
    position: relative,
  });
  return {
    items: [
      ...textItems(MAIN_PROMPT_ID, view.systemPrompt),
      // 毎回同じ項目を前に、送るたびに変わる追加辞書と状況を履歴の手前に置く
      marker('personaDescription'),
      marker('charDescription'),
      marker('charPersonality'),
      marker('dialogueExamples'),
      marker('additionalInfo'),
      marker('scenario'),
      marker('chatHistory'),
      marker('currentInput', 'user'),
      ...textItems(POST_HISTORY_ID, view.postHistoryInstructions),
    ],
    prefill: { content: '', enabled: false },
    usePresetOverrides: true,
  };
}

/** 構成の項目から開いて直せるプリセットの欄 */
export type CardField = Extract<
  keyof CharacterFields,
  | 'description'
  | 'personality'
  | 'scenario'
  | 'mesExample'
  | 'systemPrompt'
  | 'postHistoryInstructions'
>;

/** 印・置き換えの項目がどのプリセットの欄から来るか。欄から来なければ null */
export function cardFieldOf(item: PromptItem): CardField | null {
  switch (item.marker ?? item.id) {
    case 'charDescription':
      return 'description';
    case 'charPersonality':
      return 'personality';
    case 'scenario':
      return 'scenario';
    case 'dialogueExamples':
      return 'mesExample';
    case MAIN_PROMPT_ID:
      return 'systemPrompt';
    case POST_HISTORY_ID:
      return 'postHistoryInstructions';
    default:
      return null;
  }
}

/** プリセットの欄の今の値 */
export function cardFieldValue(view: CharacterFields, field: CardField): string {
  return view[field];
}
