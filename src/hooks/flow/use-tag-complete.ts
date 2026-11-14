import { useId, useRef, useState } from 'react';

import {
  canCompleteWord,
  matchTags,
  tagInsertText,
  tagTokenAt,
  type TagMatch,
  type TagToken,
} from '@/graph/tag-complete';
import type { IndexedTag } from '@/graph/tag-dictionary';
import { caretRectOf, type CaretRect } from '@/lib/caret-rect';
import { insertAtCaret, isQuietInput } from '@/lib/insert-at-caret';
import { useTagsStore } from '@/store/use-tags-store';

// ─────────────────────────────
// 複数行の欄のタグ補完。打ちかけの語に当たるタグを出し、選んだら打鍵と同じ扱いで置き換える。
// 欄の焦点は動かさず、候補の一覧は欄の印（aria-activedescendant）で選んでいる行を知らせる。
// ─────────────────────────────

/** 補完で出す候補の数 */
const MAX_SUGGESTIONS = 20;

/** 出している候補 */
export interface TagSuggestions {
  readonly matches: readonly TagMatch[];
  readonly active: number;
  readonly caret: CaretRect;
  readonly word: string;
}

/** 欄に付ける手続きと印 */
interface FieldBindings {
  readonly onInput: (event: React.FormEvent<HTMLTextAreaElement>) => void;
  readonly onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  readonly onBlur: () => void;
  readonly onCompositionStart: () => void;
  readonly onCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement>) => void;
  readonly 'aria-autocomplete': 'list';
  readonly 'aria-controls': string | undefined;
  readonly 'aria-activedescendant': string | undefined;
}

/** 補完の状態と、欄に付ける物 */
export interface TagComplete {
  readonly suggestions: TagSuggestions | null;
  readonly listId: string;
  /** 候補の行の id（読み上げの印に使う） */
  readonly optionId: (index: number) => string;
  readonly field: FieldBindings;
  /** 欄の打鍵を先に見る。補完が受けたキーなら true（欄の既定の動きは止めてある） */
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly pick: (index: number) => void;
}

interface OpenState {
  readonly token: TagToken;
  readonly suggestions: TagSuggestions;
  readonly forced: boolean;
}

/** キャレットの前の打ちかけの語。範囲を選んでいるときは無し */
function tokenOf(field: HTMLTextAreaElement): TagToken | null {
  const caret = field.selectionStart;
  return caret === field.selectionEnd ? tagTokenAt(field.value, caret) : null;
}

/**
 * その語で出す候補。出さない語（短い・書式・重み・Esc で閉じた語）と、当たるタグが無いときは null。
 * キャレットの位置は持ち続けず、出すたびにその場で読む
 */
function openAt(
  field: HTMLTextAreaElement,
  token: TagToken,
  merged: readonly IndexedTag[],
  how: { readonly forced: boolean; readonly dismissed: string | null },
): OpenState | null {
  const { forced, dismissed } = how;
  if (merged.length === 0 || !canCompleteWord(token.word, forced)) return null;
  if (!forced && dismissed === token.word) return null;
  const { matches } = matchTags(merged, token.word, MAX_SUGGESTIONS);
  if (matches.length === 0) return null;
  const caret = caretRectOf(field, token.start);
  return { token, forced, suggestions: { matches, active: 0, caret, word: token.word } };
}

/** Ctrl+Space（Mac は ⌃Space）。手で候補を出す */
function isForceKey(event: React.KeyboardEvent): boolean {
  return event.ctrlKey && (event.key === ' ' || event.code === 'Space');
}

/** `enabled` の欄でタグを補完する。辞書が 1 件も無ければ何も出さない */
export function useTagComplete(enabled: boolean): TagComplete {
  const merged = useTagsStore((state) => state.merged);
  const [open, setOpen] = useState<OpenState | null>(null);
  const listId = useId();
  // 選んで差し込む先と、変換中か・Esc で閉じた語（語が変わるまで出さない）。どれも描画に使わない
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);
  const dismissed = useRef<string | null>(null);

  const close = (): void => setOpen(null);

  /** 今のキャレットで出し直す。出せなければ閉じる */
  const update = (field: HTMLTextAreaElement, forced: boolean): void => {
    fieldRef.current = field;
    // 打った語ではない差し込み（Lora・落とした文字）の間は出さない
    const quiet = composing.current || isQuietInput(field);
    const token = enabled && !quiet ? tokenOf(field) : null;
    if (token !== null && dismissed.current !== token.word) dismissed.current = null;
    const how = { forced, dismissed: dismissed.current };
    setOpen(token === null ? null : openAt(field, token, merged, how));
  };

  const pick = (index: number): void => {
    const field = fieldRef.current;
    const match = open?.suggestions.matches[index];
    if (field === null || open === null || match === undefined) return;
    const { start, end } = open.token;
    const text = tagInsertText(match.tag.entry.tag, field.value.slice(end));
    field.setSelectionRange(start, end);
    // 入れた語で出し直さない（直後が `,` のときはキャレットが語の末尾に残る）
    dismissed.current = text;
    close();
    insertAtCaret(field, text);
  };

  const move = (step: number): void => {
    setOpen((current) => {
      if (current === null) return null;
      const count = current.suggestions.matches.length;
      const active = (current.suggestions.active + step + count) % count;
      return { ...current, suggestions: { ...current.suggestions, active } };
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.nativeEvent.isComposing) return false;
    if (isForceKey(event)) {
      event.preventDefault();
      dismissed.current = null;
      update(event.currentTarget, true);
      return true;
    }
    if (open === null) return false;
    const handled = keyAction(event.key, open.suggestions.active, { move, pick });
    if (handled === 'escape') dismissed.current = open.token.word;
    if (handled === 'escape') close();
    if (handled === null) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  return {
    suggestions: open?.suggestions ?? null,
    listId,
    optionId: (index) => `${listId}-${String(index)}`,
    onKeyDown,
    pick,
    field: {
      onInput: (event) => update(event.currentTarget, false),
      // キャレットを動かしたら出し直す（語の外へ出れば閉じる）
      onSelect: (event) => {
        if (open !== null) update(event.currentTarget, open.forced);
      },
      onBlur: close,
      onCompositionStart: () => {
        composing.current = true;
        close();
      },
      onCompositionEnd: (event) => {
        composing.current = false;
        update(event.currentTarget, false);
      },
      'aria-autocomplete': 'list',
      'aria-controls': open === null ? undefined : listId,
      'aria-activedescendant':
        open === null ? undefined : `${listId}-${String(open.suggestions.active)}`,
    },
  };
}

/** 開いているときのキーの扱い。受けたキーの種類を返し、受けなければ null */
function keyAction(
  key: string,
  active: number,
  actions: { readonly move: (step: number) => void; readonly pick: (index: number) => void },
): 'move' | 'pick' | 'escape' | null {
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    actions.move(key === 'ArrowDown' ? 1 : -1);
    return 'move';
  }
  if (key === 'Enter' || key === 'Tab') {
    actions.pick(active);
    return 'pick';
  }
  return key === 'Escape' ? 'escape' : null;
}
