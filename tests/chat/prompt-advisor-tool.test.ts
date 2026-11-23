import { describe, expect, it } from 'vitest';

import type { AdvisorMessage } from '@/chat/prompt-advisor';
import { advisorMessages } from '@/chat/prompt-advisor-text';
import {
  ADVISOR_TOOL_NAME,
  advisorCallProposals,
  advisorCallResult,
  advisorCallStatus,
  advisorRecordTargetOf,
  advisorToolOf,
  lacksAdvisorProposal,
} from '@/chat/prompt-advisor-tool';

const proposalArgs = JSON.stringify({
  title: 'T',
  changes: [{ target: 'main', content: 'Be brief.' }],
});

function targetsOf(tool: ReturnType<typeof advisorToolOf>): unknown {
  type Schema = Record<string, Record<string, Record<string, unknown>>>;
  const properties = tool.function.parameters.properties as Record<string, Record<string, unknown>>;
  const items = properties.changes?.items as Schema;
  return items.properties?.target?.enum;
}

describe('案を書かせるツール', () => {
  it('変えられる所だけを target に並べる（作業はカードと辞書を外し、段を書かせるなら辞書を足す）', () => {
    expect(advisorToolOf('story', null).function.name).toBe(ADVISOR_TOOL_NAME);
    expect(targetsOf(advisorToolOf('story', null))).toContain('card');
    expect(targetsOf(advisorToolOf('work', null))).not.toContain('card');
    expect(targetsOf(advisorToolOf('work', null))).not.toContain('dictionaryEntry');
    expect(targetsOf(advisorToolOf('work', '##playbook'))).toContain('dictionaryEntry');
  });

  it('案を書かせるツールの呼び出しだけを読み、読めない引数は案を null にする', () => {
    const read = advisorCallProposals([
      { id: 'a', name: ADVISOR_TOOL_NAME, arguments: proposalArgs },
      { id: 'b', name: 'other_tool', arguments: proposalArgs },
      { id: 'c', name: ADVISOR_TOOL_NAME, arguments: '{"title"' },
    ]);
    expect(read.map((item) => [item.call.id, item.proposal?.title ?? null])).toEqual([
      ['a', 'T'],
      ['c', null],
    ]);
  });

  it('結果は、読めなかった・反映した・まだ反映していないで言い分ける', () => {
    const call = { id: 'a', name: ADVISOR_TOOL_NAME, arguments: proposalArgs };
    expect(advisorCallStatus({ ...call, arguments: '{' }, undefined)).toBe('invalid');
    expect(advisorCallStatus(call, {})).toBe('applied');
    expect(advisorCallStatus(call, undefined)).toBe('pending');
    expect(advisorCallResult('applied')).toContain('applied this proposal');
  });
});

describe('決まったことを入れる', () => {
  it('辞書に書ける相談は辞書、ほかはプロンプトの構成に入れるよう頼む', () => {
    expect(advisorRecordTargetOf('story', null)).toBe('dictionary');
    expect(advisorRecordTargetOf('work', '##playbook')).toBe('dictionary');
    expect(advisorRecordTargetOf('work', null)).toBe('composition');
  });

  it('本文のある LLM の発言で、案のブロックも呼び出しも無いときだけ案が無いとする', () => {
    const reply = { role: 'assistant' as const, content: 'Decided.' };
    expect(lacksAdvisorProposal(reply)).toBe(true);
    expect(lacksAdvisorProposal({ ...reply, role: 'user' })).toBe(false);
    expect(lacksAdvisorProposal({ ...reply, content: ' ' })).toBe(false);
    const call = { id: 'a', name: ADVISOR_TOOL_NAME, arguments: '{"title"' };
    expect(lacksAdvisorProposal({ ...reply, toolCalls: [call] })).toBe(false);
    const block = ['```kisara-prompt', proposalArgs, '```'].join('\n');
    expect(lacksAdvisorProposal({ ...reply, content: block })).toBe(false);
  });
});

describe('呼び出しのある発言の送り方', () => {
  it('呼び出しを付けて送り、その後ろに呼び出しごとの結果を tool で置く（ほかの名前の呼び出しは送らない）', () => {
    const messages: AdvisorMessage[] = [
      { id: 'u1', role: 'user', content: 'Help' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call_a1_0', name: ADVISOR_TOOL_NAME, arguments: proposalArgs },
          { id: 'call_a1_1', name: 'other_tool', arguments: '{}' },
        ],
      },
      { id: 'u2', role: 'user', content: 'Thanks' },
    ];
    const sent = advisorMessages('', messages, {
      greeting: '',
      callResult: (call, messageId) => `${messageId}/${call.id}`,
    });
    expect(sent.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'user']);
    const reply = sent[1];
    expect(reply !== undefined && 'tool_calls' in reply ? reply.content : 'x').toBeNull();
    expect(reply !== undefined && 'tool_calls' in reply ? reply.tool_calls.length : 0).toBe(1);
    expect(sent[2]).toEqual({ role: 'tool', tool_call_id: 'call_a1_0', content: 'a1/call_a1_0' });
  });

  it('読めなかった呼び出しは、引数を {} にして送る', () => {
    const messages: AdvisorMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_a1_0', name: ADVISOR_TOOL_NAME, arguments: '{"title"' }],
      },
    ];
    const reply = advisorMessages('', messages, { greeting: '' })[0];
    const sent = reply !== undefined && 'tool_calls' in reply ? reply.tool_calls[0] : undefined;
    expect(sent?.function.arguments).toBe('{}');
  });
});
