import type { ChatPlaybook, PlaybookInstruction, PlaybookSendAction } from '@/chat/playbook';
import { currentPhase } from '@/chat/playbook-outline';

// ─────────────────────────────
// プレイブックの文と、応答の本文からの候補の読み取り。どちらも置き換えの前の文を扱う。
// ─────────────────────────────

const FENCE = /^\s*(```|~~~)/;

/** コードの囲みの外の行（囲みの中は null） */
function outsideFences(text: string): (string | null)[] {
  let inFence = false;
  return text.split('\n').map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return null;
    }
    return inFence ? null : line;
  });
}

/** 候補の始まりの行。先頭の強調・見出しの印（`**1. 題**`・`### 1. 題`）は飛ばす */
const CANDIDATE = /^\s*(?:#{1,6}\s+)?(?:[*_]{1,3})?(\d{1,2})[.)]\s+(.*)$/;

/** 応答から読んだ候補。見出しは最初の行の `:` か `：` まで、残りは本文 */
export interface Candidate {
  readonly title: string;
  readonly body: string;
}

/** 見出しの語から強調の印を外す */
function plain(text: string): string {
  return text.replace(/[*_]{2,3}/g, '').trim();
}

/**
 * 応答の本文の、行の先頭の `1.` `2.` …（`1)` も）を候補の始まりとし、次の候補の始まりまでを
 * 1 つにする。候補が 1 つも無ければ null
 */
export function candidatesFromText(text: string): Candidate[] | null {
  const drafts: string[][] = [];
  for (const line of outsideFences(text)) {
    if (line === null) continue;
    const start = CANDIDATE.exec(line);
    if (start?.[2] !== undefined) drafts.push([start[2]]);
    else if (line.trim().length > 0) drafts.at(-1)?.push(line.trim());
  }
  if (drafts.length === 0) return null;
  const split = drafts.map(([first = '', ...rest]) => {
    const colon = first.search(/[:：]/);
    const title = plain(colon > 0 ? first.slice(0, colon) : first);
    const head = colon > 0 ? plain(first.slice(colon + 1)) : '';
    return { title, head, rest };
  });
  // 指示の形の「題:」をそのまま書いて、どの候補の見出しも同じ語になったときは、続きを見出しにする
  const label = split.length > 1 && split.every((item) => item.title === split[0]?.title);
  return split.map(({ title, head, rest }) =>
    label && head.length > 0
      ? { title: head, body: rest.join('\n') }
      : { title, body: [head, ...rest].filter((line) => line.length > 0).join('\n') },
  );
}

/** 本文を 1 行にする（添える候補は 1 行ずつ） */
function oneLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ');
}

/**
 * 指示を囲む開きのタグ（フェーズの文の決まりの行と同じ名前）
 */
export const DIRECTION_OPEN = '<direction>';
/** 指示を囲む閉じのタグ */
export const DIRECTION_CLOSE = '</direction>';

/**
 * フェーズの文に置く指示の決まり（画面の言語に関わらず英語の固定の文）
 */
export const DIRECTION_RULE =
  `Text between ${DIRECTION_OPEN} and ${DIRECTION_CLOSE} is a direction from the operator, ` +
  'not words or actions of {{user}}. Follow it in the next reply and do not answer it inside the story.';

/**
 * フェーズの文を作る。どの種類のフェーズでも同じ形で、記録はここに入れず記録の辞書の常時の項目として送る
 */
export function playbookText(state: ChatPlaybook): string {
  const { playbook } = state;
  const { labels } = playbook;
  const phase = currentPhase(state);
  const lines = [`[${labels.playbook}] ${playbook.name}`];
  if (playbook.role.trim().length > 0) lines.push(`${labels.role}: ${playbook.role.trim()}`);
  lines.push(DIRECTION_RULE);
  if (phase !== undefined) lines.push(`${labels.phase}: ${phase.name} (${phase.goal})`);
  return lines.join('\n');
}

/**
 * 指示の本文を `<direction>` の行で囲む。空の段落は捨てる
 */
export function directionText(parts: readonly string[]): string {
  const body = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return [DIRECTION_OPEN, body.join('\n\n'), DIRECTION_CLOSE].join('\n');
}

/**
 * 指示の本文の後ろに添える、選んだ候補の段落を作る。無ければ空
 */
export function pickedText(picked: readonly Candidate[], label: string): string {
  if (picked.length === 0) return '';
  const lines = picked.map((item) =>
    item.body.length > 0 ? `- ${item.title}: ${oneLine(item.body)}` : `- ${item.title}`,
  );
  return [`${label}:`, ...lines].join('\n');
}

/**
 * 指示の発言が持つ記録を作る。本文は発言そのもので、操作で送ったときだけ名前と id を持つ
 */
export function directionOf(action: PlaybookSendAction | null): PlaybookInstruction {
  return action === null
    ? { name: '', content: '', direction: true }
    : { name: action.name, content: '', action: action.id, direction: true };
}
