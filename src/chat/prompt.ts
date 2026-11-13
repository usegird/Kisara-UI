import {
  MAIN_PROMPT_ID,
  type PromptComposition,
  type PromptItem,
  type PromptMarker,
  type PromptPosition,
  type PromptRole,
} from '@/chat/types';

// ─────────────────────────────
// プロンプトの構成の操作。どれも新しい構成を返す。読み戻しは prompt-parse.ts。
// ─────────────────────────────

/** 追加辞書の印か。構成にいつも 1 つあり、動かせず、無効にも消すこともできない */
export function isAnchorItem(item: PromptItem): boolean {
  return item.marker === 'additionalInfo';
}

/** 消せない印（無効にはできる） */
export function isFixedItem(item: PromptItem): boolean {
  return item.marker === 'chatHistory' || item.marker === 'currentInput';
}

/** 深さに置けるか。会話の履歴とメッセージは並びの中にだけ置く */
export function canUseDepth(item: PromptItem): boolean {
  return !isFixedItem(item) && !isAnchorItem(item);
}

/**
 * 並びの項目の role。会話の履歴の印より前は `system`、後ろ（メッセージを含む）は `user`。
 * 履歴の印が無ければメッセージの印で分け、どちらも無ければ `system`。
 * 深さの項目は履歴の中に差し込むので、項目の role を使う
 */
export function roleOf(items: readonly PromptItem[], item: PromptItem): PromptRole {
  if (item.position.kind === 'depth') return item.role;
  if (item.marker === 'currentInput') return 'user';
  const anchor =
    items.findIndex((entry) => entry.marker === 'chatHistory') >= 0
      ? items.findIndex((entry) => entry.marker === 'chatHistory')
      : items.findIndex((entry) => entry.marker === 'currentInput');
  if (anchor < 0) return 'system';
  return items.indexOf(item) < anchor ? 'system' : 'user';
}

/** 構成のメインプロンプトの本文（`main`）。無効か無ければ空 */
function mainPromptText(composition: PromptComposition): string {
  const main = composition.items.find((item) => item.id === MAIN_PROMPT_ID);
  return main?.enabled === true && main.marker === null ? main.content : '';
}

/**
 * 書き出しの根の `system` と Markdown に出す本文。構成のメインプロンプト（システムプロンプトは
 * 会話に持たないので書かない）
 */
export function leadingSystemText(chat: { readonly prompt: PromptComposition }): string {
  return mainPromptText(chat.prompt);
}

/** 項目に重ねる変更。渡した欄だけを替える */
export type PromptItemPatch = Partial<Pick<PromptItem, 'name' | 'role' | 'content' | 'enabled'>> & {
  readonly position?: PromptPosition;
};

/** 1 項目を直す。無い id・変わらない直し・印の本文・置けない深さは null */
export function updatePromptItem(
  composition: PromptComposition,
  id: string,
  patch: PromptItemPatch,
): PromptComposition | null {
  const index = composition.items.findIndex((item) => item.id === id);
  const item = composition.items[index];
  if (item === undefined) return null;
  if (patch.content !== undefined && item.marker !== null) return null;
  if (patch.position?.kind === 'depth' && !canUseDepth(item)) return null;
  if (patch.enabled === false && (isFixedItem(item) || isAnchorItem(item))) {
    return null;
  }
  const next: PromptItem = { ...item, ...patch };
  if (JSON.stringify(next) === JSON.stringify(item)) return null;
  const items = [...composition.items];
  items[index] = next;
  return { ...composition, items };
}

/**
 * 足す位置。会話の履歴の手前・メッセージのすぐ後ろ・履歴の後の段の最後
 */
type PromptPlace = 'before' | 'input' | 'after';

/**
 * 段の最後の位置（並びの index）。履歴の前の段は会話の履歴の手前（印が無ければ最後）、
 * 履歴の後の段は最後
 */
function placeIndex(items: readonly PromptItem[], place: PromptPlace): number {
  const end = items.length;
  if (place === 'after') return end;
  if (place === 'input') {
    // メッセージの印が無ければ履歴の後の段の最後
    const at = items.findIndex((entry) => entry.marker === 'currentInput');
    return at >= 0 ? Math.min(at + 1, end) : end;
  }
  // 履歴の印が無ければメッセージの印で分ける（roleOf と同じ分け目）
  const history = items.findIndex((entry) => entry.marker === 'chatHistory');
  const input = items.findIndex((entry) => entry.marker === 'currentInput');
  if (history >= 0) return history;
  return input >= 0 ? input : end;
}

/**
 * 文面の項目を足す。既定は会話の履歴の手前（履歴の前の段の最後）。`input` ならメッセージのすぐ後ろ、
 * `after` なら履歴の後の段の最後（留める項目の手前）
 */
export function addPromptItem(
  composition: PromptComposition,
  id: string,
  place: PromptPlace = 'before',
  name = '',
): PromptComposition {
  const item: PromptItem = {
    id,
    name,
    role: 'system',
    marker: null,
    content: '',
    enabled: true,
    position: { kind: 'relative' },
  };
  const items = [...composition.items];
  items.splice(placeIndex(items, place), 0, item);
  return { ...composition, items };
}

/** 項目を消す。会話の履歴とメッセージは消せない */
export function removePromptItem(
  composition: PromptComposition,
  id: string,
): PromptComposition | null {
  const item = composition.items.find((entry) => entry.id === id);
  if (item === undefined || isFixedItem(item) || isAnchorItem(item)) return null;
  return { ...composition, items: composition.items.filter((entry) => entry.id !== id) };
}

/** プレフィルを直す。変わらなければ null */
export function updatePrefill(
  composition: PromptComposition,
  patch: Partial<PromptComposition['prefill']>,
): PromptComposition | null {
  const prefill = { ...composition.prefill, ...patch };
  if (
    prefill.content === composition.prefill.content &&
    prefill.enabled === composition.prefill.enabled
  ) {
    return null;
  }
  return { ...composition, prefill };
}

/**
 * プリセット・利用者の情報を選んだときに足す、毎回同じ印
 */
const STATIC_SOURCE_MARKERS: readonly PromptMarker[] = [
  'personaDescription',
  'charDescription',
  'charPersonality',
  'dialogueExamples',
];

/**
 * 無い印を足す。足すものが無ければ同じ構成。毎回同じ印はその順で追加辞書の印の直前、状況
 * （`scenario`）は直後に置く。追加辞書の印が無ければ、どれもその順で `main` の直後（無ければ先頭）。
 * 足す印はどれも有効で置く（中身の無い印は送らない）
 */
export function withSourceMarkers(composition: PromptComposition): PromptComposition {
  const missing = (markers: readonly PromptMarker[]): PromptItem[] =>
    markers
      .filter((marker) => !composition.items.some((item) => item.marker === marker))
      .map((marker) => ({
        id: marker,
        name: '',
        role: 'system',
        marker,
        content: '',
        enabled: true,
        position: { kind: 'relative' },
      }));
  const before = missing(STATIC_SOURCE_MARKERS);
  const after = missing(['scenario']);
  if (before.length + after.length === 0) return composition;
  const items = [...composition.items];
  const anchor = items.findIndex(isAnchorItem);
  if (anchor >= 0) {
    items.splice(anchor + 1, 0, ...after);
    items.splice(anchor, 0, ...before);
  } else {
    const at = items.findIndex((item) => item.id === MAIN_PROMPT_ID) + 1;
    items.splice(at, 0, ...before, ...after);
  }
  return { ...composition, items };
}

/**
 * 画面の段。履歴の前（`system` の 1 メッセージ）・会話（過去の発言と、
 * そこへ差し込む深さの項目）・履歴の後（メッセージとつながる `user` の 1 メッセージ）
 */
interface PromptSectionView {
  readonly kind: 'before' | 'history' | 'after';
  readonly items: readonly PromptItem[];
}

/**
 * 深さの項目を差し込む順に並べる。深い方が先、同じ深さは順の値の小さい方、
 * それも同じなら渡した順。送る中身の組み立てと画面の並びで同じ順にする
 */
export function inInsertOrder(items: readonly PromptItem[]): PromptItem[] {
  const key = (item: PromptItem): readonly [number, number] =>
    item.position.kind === 'depth' ? [item.position.depth, item.position.order] : [-1, 0];
  return items
    .map((item, index) => ({ item, index, key: key(item) }))
    .sort((a, b) => b.key[0] - a.key[0] || a.key[1] - b.key[1] || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * 構成を段に分ける。無効の項目もその場に置く（送らないことは画面で示す）。空の段は出さない。
 * 会話の段の深さの項目は送る順に並べる
 */
export function sectionViews(composition: PromptComposition): PromptSectionView[] {
  const items = composition.items;
  const depth = inInsertOrder(items.filter((item) => item.position.kind === 'depth'));
  const relative = items.filter((item) => item.position.kind === 'relative');
  const history = relative.find((item) => item.marker === 'chatHistory');
  const before = relative.filter((item) => item !== history && roleOf(items, item) === 'system');
  const after = relative.filter((item) => item !== history && roleOf(items, item) === 'user');
  const sections: PromptSectionView[] = [
    { kind: 'before', items: before },
    { kind: 'history', items: history === undefined ? depth : [history, ...depth] },
    { kind: 'after', items: after },
  ];
  return sections.filter((section) => section.items.length > 0);
}

/**
 * 項目を入れられるか。`before`・`after` は入れられる段の項目、`input` は
 * メッセージ（指すとすぐ下に入る）、`fixed` は入れられない会話履歴の帯（会話履歴とその後ろの深さの
 * 項目）。画面の並べ替えの見せ方と `moveToSlot` の両方がこれを使う
 */
export type DropSlot = 'before' | 'after' | 'input' | 'fixed';

/** 構成の項目ごとの入れられるか */
export function dropSlots(composition: PromptComposition): ReadonlyMap<string, DropSlot> {
  const slots = new Map<string, DropSlot>();
  for (const view of sectionViews(composition)) {
    for (const item of view.items) {
      const slot: DropSlot =
        view.kind === 'before'
          ? 'before'
          : view.kind === 'history'
            ? 'fixed'
            : item.marker === 'currentInput'
              ? 'input'
              : 'after';
      slots.set(item.id, slot);
    }
  }
  return slots;
}

/**
 * 画面の並びで、項目を前後の行の間へ動かす。`prevId`・`nextId` は落としたあとの
 * 画面の並びで前後に来る行の id（無ければ null。プレフィルは構成の項目ではないので null）。
 * 並びの項目として次の行の手前に置き（次が無ければ履歴の後の段の最後）、深さの項目は並びの項目に戻す。
 * 次の行が会話履歴の帯かメッセージなら、帯の中へは入れず、前の行が履歴の前の段ならその段の最後、
 * ほかはメッセージのすぐ下に置く（`dropSlots`）。
 * 有効かどうかは変えない。動かせない項目か、並びが変わらなければ null
 */
export function moveToSlot(
  original: PromptComposition,
  id: string,
  prevId: string | null,
  nextId: string | null,
): PromptComposition | null {
  const find = (key: string | null): PromptItem | undefined =>
    key === null ? undefined : original.items.find((item) => item.id === key);
  const active = find(id);
  if (active === undefined || isFixedItem(active) || isAnchorItem(active)) {
    return null;
  }
  const prev = find(prevId);
  const next = find(nextId);
  const items = original.items.filter((item) => item.id !== id);
  const slots = dropSlots(original);
  const nextSlot = next === undefined ? undefined : slots.get(next.id);
  // 次の行が会話履歴の帯かメッセージなら、前の行が履歴の前の段（か無い）ときはその段の最後、
  // ほか（帯やメッセージの後ろ）はメッセージのすぐ下。次の行が無ければ前の行の後ろ、
  // 前の行も無ければ履歴の後の段の最後
  const intoBand = nextSlot === 'fixed' || nextSlot === 'input';
  const prevSlot = prev === undefined ? undefined : slots.get(prev.id);
  const at = intoBand
    ? prevSlot === undefined || prevSlot === 'before'
      ? placeIndex(items, 'before')
      : placeIndex(items, 'input')
    : next !== undefined
      ? items.indexOf(next)
      : prev !== undefined
        ? items.indexOf(prev) + 1
        : placeIndex(items, 'after');
  items.splice(at, 0, { ...active, position: { kind: 'relative' } });
  const moved = { ...original, items };
  return JSON.stringify(moved.items) === JSON.stringify(original.items) ? null : moved;
}
