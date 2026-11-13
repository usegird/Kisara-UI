import type { ChatPlaybook } from '@/chat/playbook';
import type {
  CharacterFields,
  ChatVariable,
  Persona,
  PromptItem,
  PromptMarker,
} from '@/chat/types';

// ─────────────────────────────
// 印の中身と置き換えの出どころ（`PromptSources`）と、マクロ（`{{user}}` など）の置き換え・送らない注記の扱い。
// ─────────────────────────────

/** 印の中身と置き換えの出どころ。プリセット・利用者の情報が無ければ空を返す */
export interface PromptSources {
  /** `{{user}}` の置き換え */
  readonly userName: string;
  /** `{{char}}` の置き換え。null なら置き換えない */
  readonly charName: string | null;
  /**
   * 自分で足した変数の置き換え
   */
  readonly variables?: readonly ChatVariable[] | undefined;
  /** 会話の履歴・メッセージのほかの印の中身 */
  readonly markerText: (marker: PromptMarker) => string;
  /** 文面の項目の本文を置き換えるなら、その本文（プリセットの置き換え）。置き換えないなら null */
  readonly overrideText?: ((itemId: string, original: string) => string | null) | undefined;
  /** 構成の外から足す深さの項目（追加辞書の深さの項目） */
  readonly extraItems?: readonly PromptItem[] | undefined;
  /**
   * 隣り合う `system` のメッセージをまとめるか（全体の設定）。既定はまとめない
   */
  readonly squashSystem?: boolean | undefined;
  /**
   * KisaraUI のシステムプロンプト（全体の設定）。既定は無し
   */
  readonly systemPrompt?: string | undefined;
  /**
   * 前の応答のワークフローの呼び出しと結果を履歴に入れるか。既定は入れない（設定は持たない）
   */
  readonly toolHistory?: boolean | undefined;
  /**
   * 会話のプレイブックの、引いた定義と今のフェーズ。無ければフェーズの文を置かない
   */
  readonly playbook?: ChatPlaybook | undefined;
}

/** `{{user}}` の名前が空のときに送る名前（SillyTavern の既定と同じ） */
export const DEFAULT_USER_NAME = 'User';

/** 印の中身も変数も無い出どころ */
export const NO_SOURCES: PromptSources = {
  userName: DEFAULT_USER_NAME,
  charName: null,
  /** 印の中身はいつも空 */
  markerText: () => '',
};

/**
 * 送る文にするか（`send`）、画面に出す文にするか（`show`）。戻すの行の扱いと、送らない注記を外すか
 * だけが違う
 */
type MacroMode = 'send' | 'show';

/** 送らない注記の囲みの行（画面の注記の枠に直せない文字で出す） */
export const COMMENT_OPEN = '<comment>';

export const COMMENT_CLOSE = '</comment>';

/** 文の中の送らない注記の本文（囲みの中身。空は捨てる） */
export function commentsOf(text: string): string[] {
  return [...text.matchAll(/<comment>([\s\S]*?)<\/comment>/giu)]
    .map((match) => (match[1] ?? '').trim())
    .filter((note) => note.length > 0);
}

/**
 * 送らない注記（`<comment>` と `</comment>` の間）を外す。行まるごとの注記は行ごと外し、
 * 外したら末尾の空白を落とす。閉じていない `<comment>` は外さない
 */
export function stripComments(text: string): string {
  if (!/<comment>/iu.test(text)) return text;
  const stripped = text
    .replace(/^[ \t]*<comment>[\s\S]*?<\/comment>[ \t]*(?:\r?\n|$)/gimu, '')
    .replace(/<comment>[\s\S]*?<\/comment>/giu, '');
  return stripped === text ? text : stripped.trimEnd();
}

/** 本文を注記とそれ以外に分けた 1 つ。`start` は本文の頭からの位置 */
export interface CommentSegment {
  readonly kind: 'text' | 'comment';
  readonly text: string;
  readonly start: number;
}

/**
 * 本文を、送らない注記（中身）とそれ以外に分ける。空白だけの所は捨てる。`open` なら閉じていない
 * `<comment>` から後ろも注記にする（受け取り中は閉じる前から畳むため）。受け取り終えて閉じていない
 * 囲みは、送るときも外さないので本文のまま
 */
export function splitComments(text: string, open: boolean): CommentSegment[] {
  const segments: CommentSegment[] = [];
  const push = (kind: CommentSegment['kind'], value: string, start: number): void => {
    if (value.trim().length === 0) return;
    segments.push({ kind, text: kind === 'text' ? value : value.trim(), start });
  };
  let last = 0;
  for (const match of text.matchAll(/<comment>([\s\S]*?)<\/comment>/giu)) {
    push('text', text.slice(last, match.index), last);
    push('comment', match[1] ?? '', match.index);
    last = match.index + match[0].length;
  }
  const rest = text.slice(last);
  const unclosed = open ? rest.search(/<comment>/iu) : -1;
  if (unclosed < 0) {
    push('text', rest, last);
    return segments;
  }
  push('text', rest.slice(0, unclosed), last);
  push('comment', rest.slice(unclosed + COMMENT_OPEN.length), last + unclosed);
  return segments;
}

/**
 * `{{user}}`・`{{char}}` と自分で足した変数を置き換える（大文字小文字を区別しない）。戻すの行は最後に
 * 掛け、送るときは値（元の文字）を名前（送る文字）に替え、画面に出すときは名前を値に戻す。送るときは
 * 送らない注記（`<comment>`）も外す。どの行も上から 1 回ずつ文全体に掛け、掛け直さない（前の行が
 * 替えた文字は後の行が替えうるが、循環する行があっても止まる）
 */
export function applyMacros(
  text: string,
  sources: PromptSources,
  mode: MacroMode = 'send',
): string {
  const kept = mode === 'send' ? stripComments(text) : text;
  let result = kept.replace(/\{\{user\}\}/gi, sources.userName);
  const charName = sources.charName;
  if (charName !== null) result = result.replace(/\{\{char\}\}/gi, charName);
  const variables = (sources.variables ?? []).filter((item) => isCustomVariable(item.name));
  for (const variable of variables) {
    if (variable.restore !== true) result = replaceText(result, variable.name, variable.value);
  }
  for (const variable of variables) {
    if (variable.restore !== true) continue;
    result =
      mode === 'send'
        ? replaceText(result, variable.value, variable.name)
        : replaceText(result, variable.name, variable.value);
  }
  return result;
}

/** `{{char}}` の名前が空のときに送る名前 */
export const DEFAULT_CHAR_NAME = 'Assistant';

/**
 * 名前と変数だけの置き換えの出どころ（印の中身は持たない）。発言を送る・画面に出す・追加辞書を当てる
 * ときに使う。名前には戻すを入れられない。名前を替えて送るときは戻すの行を足し、それが置き換えた名前にも
 * 掛かる（applyMacros）
 */
export function nameSources(
  character: CharacterFields | null,
  persona: Persona | null,
): PromptSources {
  return {
    ...NO_SOURCES,
    userName: persona?.name.trim() || NO_SOURCES.userName,
    charName: character === null ? null : character.name.trim() || DEFAULT_CHAR_NAME,
    variables: character?.variables ?? [],
  };
}

/** 文の中の `from` を全部 `to` にする（大文字小文字を区別しない）。`from` が空なら何もしない */
function replaceText(text: string, from: string, to: string): string {
  if (from.length === 0) return text;
  // 置き換える値の `$` を置き換えの記法として読ませない
  return text.replace(new RegExp(escapeRegExp(from), 'gi'), () => to);
}

/**
 * 変数の名前を `{{名前}}` の形にそろえる（打った前後の空白と波かっこは外してから付け直す）。
 * 中身が空なら空。戻すの行は `{{}}` を外し、打った文字のまま使う
 */
export function normalizeVariableName(raw: string, restore = false): string {
  const inner = raw.trim().replace(/^\{+/, '').replace(/\}+$/, '').trim();
  if (restore) return inner;
  return inner.length === 0 ? '' : `{{${inner}}}`;
}

/** 自分で足した変数として置き換える名前か（空と `{{user}}`・`{{char}}` は除く） */
function isCustomVariable(name: string): boolean {
  const lower = name.toLowerCase();
  return name.length > 0 && lower !== '{{user}}' && lower !== '{{char}}';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
