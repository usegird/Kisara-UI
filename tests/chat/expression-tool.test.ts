import { describe, expect, it } from 'vitest';

import {
  expressionChoiceOf,
  expressionToolOf,
  shownExpressionOf,
  takeExpressionCalls,
  withExpression,
} from '@/chat/expression-tool';
import type { Candidate, Chat, ChatMessage, ToolCallRecord } from '@/chat/types';

const call = (name: string, args: string): ToolCallRecord => ({
  id: name,
  name,
  arguments: args,
  state: { kind: 'receiving' },
});

const candidate = (patch: Partial<Candidate> = {}): Candidate => ({
  content: '本文',
  reasoning: '',
  end: { kind: 'done', reason: null },
  ...patch,
});

const message = (id: string, role: ChatMessage['role'], candidates: Candidate[]): ChatMessage => ({
  id,
  role,
  candidates,
  selected: candidates.length - 1,
});

function chatOf(messages: ChatMessage[]): Chat {
  const shell: Pick<Chat, 'messages'> = { messages };
  return shell as Chat;
}

const LABELS = ['neutral', 'joy', 'sad'];

describe('ツールの定義', () => {
  it('ラベルを並びの順に列挙する', () => {
    const tool = expressionToolOf(LABELS);
    expect(tool.function.name).toBe('set_expression');
    expect(JSON.stringify(tool.function.parameters)).toContain('["neutral","joy","sad"]');
  });
});

describe('呼び出しを表情にする', () => {
  it('最後の合うラベルを残し、表情の呼び出しを外し、ほかの呼び出しと本文は変えない', () => {
    const workflow = call('draw', '{}');
    const chat = chatOf([
      message('m1', 'assistant', [
        candidate({
          toolCalls: [
            call('set_expression', '{"label":"joy"}'),
            workflow,
            call('set_expression', '{"label":"sad"}'),
            call('set_expression', '{"label":"angry"}'),
          ],
        }),
      ]),
    ]);
    const next = takeExpressionCalls(chat, LABELS).messages[0]?.candidates[0];
    expect(next?.expression).toBe('sad');
    expect(next?.toolCalls).toEqual([workflow]);
    expect(next?.content).toBe('本文');
  });

  it('呼び出しが無ければ同じ会話を返す', () => {
    const chat = chatOf([message('m1', 'assistant', [candidate()])]);
    expect(takeExpressionCalls(chat, LABELS)).toBe(chat);
  });

  it('近似判定の結果は、その発言の候補にだけ残す', () => {
    const chat = chatOf([message('m1', 'assistant', [candidate(), candidate()])]);
    const next = withExpression(chat, 'm1', 0, 'joy');
    expect(next.messages[0]?.candidates.map((item) => item.expression)).toEqual(['joy', undefined]);
    expect(withExpression(chat, 'none', 0, 'joy')).toBe(chat);
  });
});

describe('出す表情', () => {
  it('最後の assistant から遡って、選んでいる候補が表情を持つ最初の発言の表情', () => {
    const messages = [
      message('m1', 'assistant', [candidate({ expression: 'joy' })]),
      message('m2', 'user', [candidate()]),
      message('m3', 'assistant', [candidate({ end: { kind: 'streaming' } })]),
    ];
    expect(shownExpressionOf(messages, undefined, true)).toBe('joy');
    expect(shownExpressionOf([message('m1', 'user', [candidate()])], undefined, true)).toBeNull();
  });

  it('利用者が決めた表情は、決めたときの発言より後にラベルが来るまで出す。無効なら決めた表情だけ', () => {
    const before = [message('m1', 'assistant', [candidate({ expression: 'joy' })])];
    const choice = expressionChoiceOf(before, 'sad');
    expect(choice).toEqual({ label: 'sad', after: 'm1' });
    expect(shownExpressionOf(before, choice, true)).toBe('sad');
    const later = [...before, message('m2', 'assistant', [candidate()])];
    expect(shownExpressionOf(later, choice, true)).toBe('sad');
    const labeled = [...before, message('m3', 'assistant', [candidate({ expression: 'joy' })])];
    expect(shownExpressionOf(labeled, choice, true)).toBe('joy');
    expect(shownExpressionOf(labeled, choice, false)).toBe('sad');
    expect(shownExpressionOf(labeled, undefined, false)).toBeNull();
    expect(shownExpressionOf([], expressionChoiceOf([], 'joy'), true)).toBe('joy');
  });
});
