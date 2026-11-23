import type { ChatPlaybook } from '@/chat/playbook';
import type {
  CharacterFields,
  ChatVariable,
  Persona,
  PromptItem,
  PromptMarker,
} from '@/chat/types';

export interface PromptSources {
  readonly userName: string;
  readonly charName: string | null;
  readonly variables?: readonly ChatVariable[] | undefined;
  readonly markerText: (marker: PromptMarker) => string;
  readonly overrideText?: ((itemId: string, original: string) => string | null) | undefined;
  readonly extraItems?: readonly PromptItem[] | undefined;
  readonly squashSystem?: boolean | undefined;
  readonly systemPrompt?: string | undefined;
  readonly toolHistory?: boolean | undefined;
  readonly playbook?: ChatPlaybook | undefined;
}

export const DEFAULT_USER_NAME = 'User';

export const NO_SOURCES: PromptSources = {
  userName: DEFAULT_USER_NAME,
  charName: null,
  markerText: () => '',
};

type MacroMode = 'send' | 'show';

export const COMMENT_OPEN = '<comment>';

export const COMMENT_CLOSE = '</comment>';

export function commentsOf(text: string): string[] {
  return [...text.matchAll(/<comment>([\s\S]*?)<\/comment>/giu)]
    .map((match) => (match[1] ?? '').trim())
    .filter((note) => note.length > 0);
}

export function stripComments(text: string): string {
  if (!/<comment>/iu.test(text)) return text;
  const stripped = text
    .replace(/^[ \t]*<comment>[\s\S]*?<\/comment>[ \t]*(?:\r?\n|$)/gimu, '')
    .replace(/<comment>[\s\S]*?<\/comment>/giu, '');
  return stripped === text ? text : stripped.trimEnd();
}

export interface CommentSegment {
  readonly kind: 'text' | 'comment';
  readonly text: string;
  readonly start: number;
}

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

export const DEFAULT_CHAR_NAME = 'Assistant';

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

function replaceText(text: string, from: string, to: string): string {
  if (from.length === 0) return text;
  return text.replace(new RegExp(escapeRegExp(from), 'gi'), () => to);
}

export function normalizeVariableName(raw: string, restore = false): string {
  const inner = raw.trim().replace(/^\{+/, '').replace(/\}+$/, '').trim();
  if (restore) return inner;
  return inner.length === 0 ? '' : `{{${inner}}}`;
}

function isCustomVariable(name: string): boolean {
  const lower = name.toLowerCase();
  return name.length > 0 && lower !== '{{user}}' && lower !== '{{char}}';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
