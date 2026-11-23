import {
  defaultOutlineView,
  type OutlineView,
  type PhaseKind,
  type Playbook,
  type PlaybookAction,
  type PlaybookPhase,
  type PlaybookSendAction,
} from '@/chat/playbook';

export type ActionOwner = string | null;

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function blankSend(id: string): PlaybookSendAction {
  return { kind: 'send', id, name: '', instruction: '' };
}

export function withActionKind(
  action: PlaybookAction,
  kind: PlaybookAction['kind'],
): PlaybookAction {
  if (action.kind === kind) return action;
  const { id, name } = action;
  if (kind === 'send') return { ...blankSend(id), name };
  if (kind === 'consult') {
    return { kind, id, name, greeting: '', instruction: '', outline: false };
  }
  return { kind, id, name };
}

export function addPhase(draft: Playbook, phaseId: string, actionId: string): Playbook {
  const phase: PlaybookPhase = {
    id: phaseId,
    name: '',
    kind: 'decide',
    outline: defaultOutlineView('decide'),
    goal: '',
    actions: [blankSend(actionId)],
  };
  return { ...draft, phases: [...draft.phases, phase] };
}

export function removePhase(draft: Playbook, phaseId: string): Playbook {
  if (draft.phases.length <= 1) return draft;
  return { ...draft, phases: draft.phases.filter((phase) => phase.id !== phaseId) };
}

export function movePhase(draft: Playbook, from: number, to: number): Playbook {
  return { ...draft, phases: move(draft.phases, from, to) };
}

export function updatePhase(
  draft: Playbook,
  phaseId: string,
  change: Partial<{ name: string; kind: PhaseKind; outline: OutlineView; goal: string }>,
): Playbook {
  return {
    ...draft,
    phases: draft.phases.map((phase) => (phase.id === phaseId ? { ...phase, ...change } : phase)),
  };
}

function withActions(
  draft: Playbook,
  owner: ActionOwner,
  edit: (actions: readonly PlaybookAction[]) => readonly PlaybookAction[],
): Playbook {
  if (owner === null) {
    const standing = edit(draft.standing).filter(
      (action): action is PlaybookSendAction => action.kind === 'send',
    );
    return { ...draft, standing };
  }
  return {
    ...draft,
    phases: draft.phases.map((phase) =>
      phase.id === owner ? { ...phase, actions: edit(phase.actions) } : phase,
    ),
  };
}

export function addAction(draft: Playbook, owner: ActionOwner, actionId: string): Playbook {
  return withActions(draft, owner, (actions) => [...actions, blankSend(actionId)]);
}

export function removeAction(draft: Playbook, owner: ActionOwner, actionId: string): Playbook {
  return withActions(draft, owner, (actions) => actions.filter((action) => action.id !== actionId));
}

export function moveAction(
  draft: Playbook,
  owner: ActionOwner,
  from: number,
  to: number,
): Playbook {
  return withActions(draft, owner, (actions) => move(actions, from, to));
}

export function updateAction(
  draft: Playbook,
  owner: ActionOwner,
  actionId: string,
  next: PlaybookAction,
): Playbook {
  return withActions(draft, owner, (actions) =>
    actions.map((action) => (action.id === actionId ? next : action)),
  );
}

export function savable(draft: Playbook): boolean {
  return (
    draft.name.trim().length > 0 && draft.phases.every((phase) => phase.name.trim().length > 0)
  );
}
