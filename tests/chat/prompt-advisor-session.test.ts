import { describe, expect, it } from 'vitest';

import { PLAYBOOK_ID, PREFILL_ID } from '@/chat/assemble';
import { applyProposal, type AdvisorMessage, type AdvisorProposal } from '@/chat/prompt-advisor';
import {
  advisorLimitNoticeOf,
  advisorSummaryRange,
  advisorSummaryRequest,
  advisorSummaryText,
  advisorUnsummarized,
  isAdvisorNearLimit,
} from '@/chat/prompt-advisor-summary';
import { advisorMessages } from '@/chat/prompt-advisor-text';
import { ADDITIONAL_INFO_ID } from '@/chat/types';

import { contentText, sampleComposition } from '../helpers/llm';

// ─────────────────────────────
// 構成の相談の、反映した後に開く行と、要約（縮める範囲・送る発言・上限に近いか）
// ─────────────────────────────

const rowsOf = (changes: AdvisorProposal['changes'], outline: string | null = null): string[] => {
  let next = 0;
  return [
    ...applyProposal(
      { prompt: sampleComposition(), character: null, lorebooks: [] },
      { title: '', changes },
      { newId: () => `new-${String((next += 1))}`, lorebookName: 'Book', outline },
    ).changedRows,
  ];
};

const entry = (dictionary: string) =>
  ({
    target: 'dictionaryEntry',
    dictionary,
    keys: [],
    content: 'E',
    constant: true,
    comment: 'c',
    enabled: true,
  }) as const;

/** 発言 n 件（user と assistant を交互に。id は m0, m1, …） */
const talk = (count: number): AdvisorMessage[] =>
  Array.from({ length: count }, (_, at) => ({
    id: `m${String(at)}`,
    role: at % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `text ${String(at)}`,
  }));

describe('反映した後に開く行', () => {
  it('変えた項目・足した項目・プレフィルを開き、消した項目と当てなかった所は開かない', () => {
    const rows = rowsOf([
      { target: 'item', id: 'rules', content: 'R' },
      { target: 'newItem', name: 'N', place: 'before', content: 'X' },
      { target: 'prefill', content: 'P' },
      { target: 'removeItem', id: 'tone' },
      { target: 'item', id: 'missing', content: 'Y' },
    ]);
    expect(rows.sort()).toEqual([PREFILL_ID, 'new-1', 'rules'].sort());
  });

  it('カードの欄は送る印の項目、個別追加辞書は追加辞書の印、段はプレイブックの行を開く', () => {
    let next = 0;
    const { next: after, changedRows } = applyProposal(
      { prompt: sampleComposition(), character: null, lorebooks: [] },
      { title: '', changes: [{ target: 'character', field: 'description', content: 'D' }] },
      { newId: () => `new-${String((next += 1))}`, lorebookName: 'Book' },
    );
    const marker = after.prompt.items.find((item) => item.marker === 'charDescription');
    expect(changedRows).toEqual([marker?.id]);
    expect(rowsOf([entry('Book')])).toEqual([ADDITIONAL_INFO_ID]);
    expect(rowsOf([entry('##playbook')], '##playbook')).toEqual([PLAYBOOK_ID]);
  });
});

describe('相談の要約', () => {
  it('新しい 2 件（最後の 1 往復）を残して縮め、要約した後ろから次の範囲を数える', () => {
    expect(advisorSummaryRange(talk(2), undefined)).toBeNull();
    // 2 往復で上限に届いても、前の 1 往復を縮められる
    expect(advisorSummaryRange(talk(4), undefined)).toEqual({ from: 0, to: 2 });
    const summary = { content: 'S', upTo: 'm2' };
    expect(advisorSummaryRange(talk(5), summary)).toBeNull();
    expect(advisorSummaryRange(talk(7), summary)).toEqual({ from: 3, to: 5 });
  });

  it('送れなかった・長さで切れたなら上限を超えた、使った数が 8 割以上なら上限に近いと知らせる', () => {
    const replied = (patch: Partial<AdvisorMessage>): AdvisorMessage[] => [
      ...talk(1),
      { id: 'a', role: 'assistant', content: 'A', ...patch },
    ];
    const overflow = { kind: 'rejected', overflow: { context: 8000, prompt: 9000 } } as const;
    expect(advisorLimitNoticeOf(replied({}), overflow, null)).toBe('over');
    expect(advisorLimitNoticeOf(replied({ finishReason: 'length' }), null, null)).toBe('over');
    const near = replied({ usage: { prompt: 4800, completion: 100 } });
    expect(advisorLimitNoticeOf(near, null, 6000)).toBe('near');
    expect(advisorLimitNoticeOf(replied({ finishReason: 'stop' }), null, 6000)).toBeNull();
  });

  it('要約させる中身は前の要約と縮める発言で、上限に収まるだけ縮める', () => {
    const messages = talk(10).map((message) => ({ ...message, content: 'x'.repeat(400) }));
    const summary = { content: 'OLD', upTo: 'm0' };
    const whole = advisorSummaryRequest(messages, summary, {
      range: { from: 1, to: 6 },
      limit: null,
    });
    const user = contentText(whole.messages[1]!);
    expect(user).toContain('<previous_summary>\nOLD');
    expect(user).toContain('User: ');
    expect(user).toContain('Assistant: ');
    const fitted = advisorSummaryRequest(messages, summary, {
      range: { from: 1, to: 6 },
      limit: 300,
    });
    expect(fitted.range.from).toBe(1);
    expect(fitted.range.to).toBeLessThan(6);
  });

  it('要約した相談は、初期メッセージの後ろに要約を置き、縮めた後の発言だけを送る', () => {
    const summary = { content: 'S', upTo: 'm2' };
    const sent = advisorMessages('SYS', advisorUnsummarized(talk(5), summary), {
      greeting: 'G',
      summary: advisorSummaryText(summary),
    });
    expect(sent.map((message) => message.role)).toEqual([
      'system',
      'assistant',
      'system',
      'assistant',
      'user',
    ]);
    expect(sent[2]?.content).toBe('[Summary: S]');
    expect(sent[3]?.content).toBe('text 3');
  });

  it('最後の発言の使った数が上限の 8 割以上なら上限に近い。数が無い・上限が分からなければ近くない', () => {
    const last = (usage?: { prompt: number; completion: number }): AdvisorMessage[] => [
      ...talk(1),
      { id: 'a', role: 'assistant', content: 'A', usage },
    ];
    expect(isAdvisorNearLimit(last({ prompt: 4700, completion: 100 }), 6000)).toBe(true);
    expect(isAdvisorNearLimit(last({ prompt: 4000, completion: 100 }), 6000)).toBe(false);
    expect(isAdvisorNearLimit(last(), 6000)).toBe(false);
    expect(isAdvisorNearLimit(last({ prompt: 9000, completion: 0 }), null)).toBe(false);
  });
});
