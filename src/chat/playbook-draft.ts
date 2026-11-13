import {
  defaultOutlineView,
  type OutlineView,
  type PhaseKind,
  type Playbook,
  type PlaybookAction,
  type PlaybookPhase,
  type PlaybookSendAction,
} from '@/chat/playbook';

// ─────────────────────────────
// プレイブックを作る・直すときの直しかけで、フェーズと操作を足す・消す・並べ替える・書き換える。
// どれも新しい写しを返す。
// ─────────────────────────────

/** 操作の置き場。フェーズの id か、常設の操作（null） */
export type ActionOwner = string | null;

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** 空の送るの操作 */
function blankSend(id: string): PlaybookSendAction {
  return { kind: 'send', id, name: '', instruction: '' };
}

/** 操作の種類を変える。名前と id は残し、種類に要る項目を既定で埋める */
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

/** 空のフェーズを末尾に足す。空の送るの操作を 1 つ持たせる */
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

/** フェーズを消す。最後の 1 件は消さない（フェーズは 1 件以上を保つ） */
export function removePhase(draft: Playbook, phaseId: string): Playbook {
  if (draft.phases.length <= 1) return draft;
  return { ...draft, phases: draft.phases.filter((phase) => phase.id !== phaseId) };
}

/** フェーズを並びの位置 `from` から `to` へ動かす */
export function movePhase(draft: Playbook, from: number, to: number): Playbook {
  return { ...draft, phases: move(draft.phases, from, to) };
}

/** フェーズの名前・種類・アウトラインの出し方・目的を書き換える */
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

/** 置き場の末尾に空の送るの操作を足す（常設の操作は送るの操作だけ） */
export function addAction(draft: Playbook, owner: ActionOwner, actionId: string): Playbook {
  return withActions(draft, owner, (actions) => [...actions, blankSend(actionId)]);
}

/** 操作を消す。フェーズの操作も常設の操作も空にできる（進める段には続きを書くが残る） */
export function removeAction(draft: Playbook, owner: ActionOwner, actionId: string): Playbook {
  return withActions(draft, owner, (actions) => actions.filter((action) => action.id !== actionId));
}

/** 置き場の中で操作を並びの位置 `from` から `to` へ動かす */
export function moveAction(
  draft: Playbook,
  owner: ActionOwner,
  from: number,
  to: number,
): Playbook {
  return withActions(draft, owner, (actions) => move(actions, from, to));
}

/** 置き場の操作を `next` に置き換える */
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

/** 保存できるか（名前があり、どのフェーズにも名前がある） */
export function savable(draft: Playbook): boolean {
  return (
    draft.name.trim().length > 0 && draft.phases.every((phase) => phase.name.trim().length > 0)
  );
}
