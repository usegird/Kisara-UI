import type { AdvisorUse } from '@/chat/prompt-advisor';

export type PhaseKind = 'decide' | 'proceed' | 'close';

export type ResponseUse = 'send';

export type PlaybookAction =
  | {
      readonly kind: 'send';
      readonly id: string;
      readonly name: string;
      readonly instruction: string;
      readonly use?: ResponseUse;
      readonly sendTo?: string;
      readonly revise?: true;
    }
  | {
      readonly kind: 'consult';
      readonly id: string;
      readonly name: string;
      readonly greeting: string;
      readonly instruction: string;
      readonly outline: boolean;
    }
  | { readonly kind: 'next'; readonly id: string; readonly name: string };

export type PlaybookSendAction = Extract<PlaybookAction, { kind: 'send' }>;
export type PlaybookConsultAction = Extract<PlaybookAction, { kind: 'consult' }>;

export type OutlineView = 'single' | 'multi' | 'readonly';

export const OUTLINE_VIEWS: readonly OutlineView[] = ['single', 'multi', 'readonly'];

export function defaultOutlineView(kind: PhaseKind): OutlineView {
  if (kind === 'decide') return 'readonly';
  return kind === 'close' ? 'multi' : 'single';
}

export interface PlaybookPhase {
  readonly id: string;
  readonly name: string;
  readonly kind: PhaseKind;
  readonly outline: OutlineView;
  readonly goal: string;
  readonly actions: readonly PlaybookAction[];
}

interface PlaybookLabels {
  readonly playbook: string;
  readonly role: string;
  readonly phase: string;
  readonly picked: string;
}

export interface Playbook {
  readonly id: string;
  readonly origin: 'builtin' | 'own';
  readonly name: string;
  readonly description: string;
  readonly role: string;
  readonly continue: string;
  readonly advisor: AdvisorUse;
  readonly phases: readonly PlaybookPhase[];
  readonly standing: readonly PlaybookSendAction[];
  readonly labels: PlaybookLabels;
}

export interface ChatPlaybookRef {
  readonly origin: 'builtin' | 'own';
  readonly id: string;
  readonly phase: string;
}

export interface ChatPlaybook {
  readonly playbook: Playbook;
  readonly phase: string;
}

export interface PlaybookInstruction {
  readonly name: string;
  readonly content: string;
  readonly action?: string;
  readonly direction?: true;
}

type ActionShape =
  | {
      readonly kind: 'send';
      readonly id: string;
      readonly use?: ResponseUse;
      readonly sendTo?: string;
      readonly revise?: true;
    }
  | { readonly kind: 'consult'; readonly id: string; readonly outline: boolean };

interface PhaseShape {
  readonly id: string;
  readonly kind: PhaseKind;
  readonly actions: readonly ActionShape[];
}

interface PlaybookShape {
  readonly id: string;
  readonly advisor: AdvisorUse;
  readonly phases: readonly PhaseShape[];
  readonly standing: readonly string[];
}

const send = (
  id: string,
  options: { use?: ResponseUse; sendTo?: string; revise?: true } = {},
): ActionShape => ({
  kind: 'send',
  id,
  ...options,
});
const consult = (id: string, outline = false): ActionShape => ({ kind: 'consult', id, outline });
const phase = (id: string, kind: PhaseKind, actions: readonly ActionShape[]): PhaseShape => ({
  id,
  kind,
  actions,
});

const prepare = phase('prepare', 'decide', [consult('makePlan', true)]);

const revise = send('revise', { revise: true });

export const BUILTIN_PLAYBOOKS: readonly PlaybookShape[] = [
  {
    id: 'story',
    advisor: 'story',
    phases: [
      phase('writing', 'proceed', [
        consult('makePlan', true),
        revise,
        send('deepen'),
        send('shake'),
        send('shift'),
        send('widen'),
        send('close'),
      ]),
    ],
    standing: [],
  },
  {
    id: 'roleplay',
    advisor: 'roleplay',
    phases: [
      prepare,
      phase('scene', 'proceed', [send('moveIdeas', { use: 'send' })]),
      phase('closing', 'close', [send('closeScene'), send('checkVoice')]),
    ],
    standing: ['changeScene', 'accident'],
  },
  {
    id: 'ideas',
    advisor: 'work',
    phases: [
      phase('frame', 'decide', [consult('shapeFrame', true)]),
      phase('diverge', 'proceed', [send('generate')]),
      phase('provoke', 'proceed', [send('objections'), send('reverse')]),
      phase('converge', 'proceed', [
        send('themes'),
        send('narrow', { use: 'send', sendTo: 'capture' }),
      ]),
      phase('capture', 'close', [send('capture')]),
    ],
    standing: ['assumptions'],
  },
  {
    id: 'research',
    advisor: 'work',
    phases: [
      phase('questions', 'decide', [consult('makeQuestions', true)]),
      phase('gather', 'proceed', [send('answer')]),
      phase('summarize', 'close', [send('summarize')]),
      phase('verify', 'close', [send('verify')]),
    ],
    standing: ['assumptions', 'plain'],
  },
  {
    id: 'document',
    advisor: 'work',
    phases: [
      prepare,
      phase('sections', 'proceed', [
        send('writeSection'),
        send('contentIdeas', { use: 'send', sendTo: 'writeSection' }),
      ]),
      phase('readerTest', 'close', [send('readerQuestions'), send('reviewAll')]),
    ],
    standing: ['plain'],
  },
];

type PlaybookTextPath = `llm.playbook.${string}`;

function playbookLabels(text: (path: PlaybookTextPath) => string): PlaybookLabels {
  const label = (key: keyof PlaybookLabels): string => text(`llm.playbook.frame.${key}`);
  return {
    playbook: label('playbook'),
    role: label('role'),
    phase: label('phase'),
    picked: label('picked'),
  };
}

export function resolvePlaybook(
  shape: PlaybookShape,
  text: (path: PlaybookTextPath) => string,
): Playbook {
  const base = `llm.playbook.builtin.${shape.id}` as const;
  const action = (item: ActionShape): PlaybookAction => {
    const at = `${base}.actions.${item.id}` as const;
    const name = text(`${at}.name`);
    if (item.kind === 'send') return { ...item, name, instruction: text(`${at}.instruction`) };
    return {
      ...item,
      name,
      greeting: text(`${at}.greeting`),
      instruction: text(`${at}.instruction`),
    };
  };
  return {
    id: shape.id,
    origin: 'builtin',
    name: text(`${base}.name`),
    description: text(`${base}.description`),
    role: text(`${base}.role`),
    continue: text(`${base}.continue`),
    advisor: shape.advisor,
    phases: shape.phases.map((item) => ({
      id: item.id,
      kind: item.kind,
      outline: defaultOutlineView(item.kind),
      name: text(`${base}.phases.${item.id}.name`),
      goal: text(`${base}.phases.${item.id}.goal`),
      actions: item.actions.map(action),
    })),
    standing: shape.standing.map((id) => ({
      kind: 'send',
      id,
      name: text(`llm.playbook.shared.${id}.name`),
      instruction: text(`llm.playbook.shared.${id}.instruction`),
    })),
    labels: playbookLabels(text),
  };
}

export const HELD_PLAYBOOK_IDS: readonly string[] = ['roleplay', 'ideas', 'research', 'document'];

export function findAction(playbook: Playbook, id: string): PlaybookAction | undefined {
  for (const item of playbook.phases) {
    const found = item.actions.find((action) => action.id === id);
    if (found !== undefined) return found;
  }
  return playbook.standing.find((action) => action.id === id);
}
