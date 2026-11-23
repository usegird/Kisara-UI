import {
  defaultOutlineView,
  OUTLINE_VIEWS,
  type ChatPlaybookRef,
  type PhaseKind,
  type Playbook,
  type PlaybookAction,
  type PlaybookInstruction,
  type PlaybookPhase,
  type PlaybookSendAction,
  type ResponseUse,
} from '@/chat/playbook';
import { ADVISOR_USES } from '@/chat/prompt-advisor';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';

const USES: readonly ResponseUse[] = ['send'];
const KINDS: readonly PhaseKind[] = ['decide', 'proceed', 'close'];

function parseSend(
  raw: Record<string, unknown>,
  id: string,
  name: string,
): PlaybookSendAction | null {
  const instruction = stringOr(raw.instruction, null);
  if (instruction === null) return null;
  if (raw.revise === true) return { kind: 'send', id, name, instruction, revise: true };
  const use = USES.find((item) => item === raw.use);
  const sendTo = stringOr(raw.sendTo, null);
  return {
    kind: 'send',
    id,
    name,
    instruction,
    ...(use === undefined ? {} : { use }),
    ...(use === 'send' && sendTo !== null ? { sendTo } : {}),
  };
}

function parseAction(raw: unknown): PlaybookAction | null {
  if (!isRecord(raw)) return null;
  const id = stringOr(raw.id, null);
  const name = stringOr(raw.name, null);
  if (id === null || name === null) return null;
  switch (raw.kind) {
    case 'send':
      return parseSend(raw, id, name);
    case 'consult':
      return {
        kind: 'consult',
        id,
        name,
        greeting: stringOr(raw.greeting),
        instruction: stringOr(raw.instruction),
        outline: raw.outline === true,
      };
    case 'next':
      return { kind: raw.kind, id, name };
    default:
      return null;
  }
}

function actionsOf(raw: unknown): PlaybookAction[] {
  return isUnknownArray(raw) ? raw.flatMap((item) => parseAction(item) ?? []) : [];
}

function parsePhase(raw: unknown): PlaybookPhase | null {
  if (!isRecord(raw)) return null;
  const id = stringOr(raw.id, null);
  const name = stringOr(raw.name, null);
  const kind = KINDS.find((item) => item === raw.kind);
  if (id === null || name === null || kind === undefined) return null;
  return {
    id,
    name,
    kind,
    outline: OUTLINE_VIEWS.find((item) => item === raw.outline) ?? defaultOutlineView(kind),
    goal: stringOr(raw.goal),
    actions: actionsOf(raw.actions),
  };
}

export function parsePlaybook(raw: unknown): Playbook | null {
  if (!isRecord(raw)) return null;
  const id = stringOr(raw.id, null);
  const name = stringOr(raw.name, null);
  const phases = isUnknownArray(raw.phases)
    ? raw.phases.flatMap((item) => parsePhase(item) ?? [])
    : [];
  if (id === null || name === null || phases.length === 0) return null;
  const labels = isRecord(raw.labels) ? raw.labels : {};
  const label = (key: string, fallback: string): string => stringOr(labels[key], fallback);
  return {
    id,
    origin: raw.origin === 'own' ? 'own' : 'builtin',
    name,
    description: stringOr(raw.description),
    role: stringOr(raw.role),
    continue: stringOr(raw.continue),
    advisor: ADVISOR_USES.find((item) => item === raw.advisor) ?? 'blank',
    phases,
    standing: actionsOf(raw.standing).filter(
      (action): action is PlaybookSendAction => action.kind === 'send',
    ),
    labels: {
      playbook: label('playbook', 'Playbook'),
      role: label('role', 'Role'),
      phase: label('phase', 'Phase'),
      picked: label('picked', 'Chosen candidates'),
    },
  };
}

export function parseChatPlaybook(
  raw: unknown,
): { readonly playbook: ChatPlaybookRef } | Record<string, never> {
  if (!isRecord(raw)) return {};
  const id = stringOr(raw.id, null);
  if (id === null) return {};
  return {
    playbook: {
      origin: raw.origin === 'own' ? 'own' : 'builtin',
      id,
      phase: stringOr(raw.phase),
    },
  };
}

export function parseInstruction(
  raw: unknown,
): { readonly instruction: PlaybookInstruction } | Record<string, never> {
  if (!isRecord(raw) || raw.direction !== true) return {};
  const name = stringOr(raw.name, null);
  const content = stringOr(raw.content, null);
  if (name === null || content === null) return {};
  const action = stringOr(raw.action, null);
  return {
    instruction: {
      name,
      content,
      ...(action === null ? {} : { action }),
      direction: true,
    },
  };
}
