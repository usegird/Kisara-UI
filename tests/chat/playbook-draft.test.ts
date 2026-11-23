import { describe, expect, it } from 'vitest';

import {
  addAction,
  addPhase,
  moveAction,
  movePhase,
  removeAction,
  removePhase,
  savable,
  withActionKind,
} from '@/chat/playbook-draft';

import { chatPlaybook } from '../helpers/llm';

const draft = chatPlaybook().playbook;

describe('プレイブックの直しかけ', () => {
  it('フェーズを足す・並べ替える。最後の 1 つは消さない', () => {
    const added = addPhase(draft, 'p3', 'a3');
    expect(added.phases.map((phase) => phase.id)).toEqual(['plan', 'write', 'p3']);
    expect(movePhase(added, 2, 0).phases[0]?.id).toBe('p3');
    const one = removePhase(draft, 'write');
    expect(removePhase(one, 'plan').phases).toHaveLength(1);
  });

  it('フェーズの操作も常設の操作も空にできる', () => {
    expect(removeAction(draft, 'plan', 'c').phases[0]?.actions).toEqual([]);
    const standing = addAction(draft, null, 's1');
    expect(standing.standing.map((action) => action.id)).toEqual(['s1']);
    expect(removeAction(standing, null, 's1').standing).toEqual([]);
    expect(moveAction(draft, 'write', 1, 0).phases[1]?.actions[0]?.id).toBe('n');
  });

  it('種類を変えると、名前と id を残して要る項目を埋める', () => {
    const action = draft.phases[0]!.actions[0]!;
    expect(withActionKind(action, 'send')).toEqual({
      kind: 'send',
      id: 'c',
      name: 'Consult',
      instruction: '',
    });
    expect(withActionKind(action, 'next')).toEqual({ kind: 'next', id: 'c', name: 'Consult' });
    expect(withActionKind(withActionKind(action, 'next'), 'consult')).toMatchObject({
      kind: 'consult',
      outline: false,
    });
  });

  it('名前の無いプレイブックやフェーズは保存できない', () => {
    expect(savable(draft)).toBe(true);
    expect(savable({ ...draft, name: ' ' })).toBe(false);
    expect(savable(addPhase(draft, 'p3', 'a3'))).toBe(false);
  });
});
