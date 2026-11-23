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

const MAX_SUGGESTIONS = 20;

export interface TagSuggestions {
  readonly matches: readonly TagMatch[];
  readonly active: number;
  readonly caret: CaretRect;
  readonly word: string;
}

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

export interface TagComplete {
  readonly suggestions: TagSuggestions | null;
  readonly listId: string;
  readonly optionId: (index: number) => string;
  readonly field: FieldBindings;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readonly pick: (index: number) => void;
}

interface OpenState {
  readonly token: TagToken;
  readonly suggestions: TagSuggestions;
  readonly forced: boolean;
}

function tokenOf(field: HTMLTextAreaElement): TagToken | null {
  const caret = field.selectionStart;
  return caret === field.selectionEnd ? tagTokenAt(field.value, caret) : null;
}

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

function isForceKey(event: React.KeyboardEvent): boolean {
  return event.ctrlKey && (event.key === ' ' || event.code === 'Space');
}

export function useTagComplete(enabled: boolean): TagComplete {
  const merged = useTagsStore((state) => state.merged);
  const [open, setOpen] = useState<OpenState | null>(null);
  const listId = useId();
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const composing = useRef(false);
  const dismissed = useRef<string | null>(null);

  const close = (): void => setOpen(null);

  const update = (field: HTMLTextAreaElement, forced: boolean): void => {
    fieldRef.current = field;
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
