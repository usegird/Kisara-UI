import type { ChatPlaybook, PlaybookInstruction, PlaybookSendAction } from '@/chat/playbook';
import { currentPhase } from '@/chat/playbook-outline';

const FENCE = /^\s*(```|~~~)/;

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

const CANDIDATE = /^\s*(?:#{1,6}\s+)?(?:[*_]{1,3})?(\d{1,2})[.)]\s+(.*)$/;

export interface Candidate {
  readonly title: string;
  readonly body: string;
}

function plain(text: string): string {
  return text.replace(/[*_]{2,3}/g, '').trim();
}

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
  const label = split.length > 1 && split.every((item) => item.title === split[0]?.title);
  return split.map(({ title, head, rest }) =>
    label && head.length > 0
      ? { title: head, body: rest.join('\n') }
      : { title, body: [head, ...rest].filter((line) => line.length > 0).join('\n') },
  );
}

function oneLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ');
}

export const DIRECTION_OPEN = '<direction>';
export const DIRECTION_CLOSE = '</direction>';

export const DIRECTION_RULE =
  `Text between ${DIRECTION_OPEN} and ${DIRECTION_CLOSE} is a direction from the operator, ` +
  'not words or actions of {{user}}. Follow it in the next reply and do not answer it inside the story.';

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

export function directionText(parts: readonly string[]): string {
  const body = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return [DIRECTION_OPEN, body.join('\n\n'), DIRECTION_CLOSE].join('\n');
}

export function pickedText(picked: readonly Candidate[], label: string): string {
  if (picked.length === 0) return '';
  const lines = picked.map((item) =>
    item.body.length > 0 ? `- ${item.title}: ${oneLine(item.body)}` : `- ${item.title}`,
  );
  return [`${label}:`, ...lines].join('\n');
}

export function directionOf(action: PlaybookSendAction | null): PlaybookInstruction {
  return action === null
    ? { name: '', content: '', direction: true }
    : { name: action.name, content: '', action: action.id, direction: true };
}
