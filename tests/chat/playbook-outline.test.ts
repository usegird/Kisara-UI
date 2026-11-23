import { describe, expect, it } from 'vitest';

import {
  currentStep,
  editStep,
  enterPhase,
  nextStep,
  outlineSteps,
  PLAYBOOK_BOOK,
  prevStep,
  startPlaybook,
  stepKey,
  stopPlaybook,
  withAllSteps,
  withStep,
  withStepKeys,
  type PlaybookChat,
} from '@/chat/playbook-outline';
import {
  candidatesFromText,
  DIRECTION_RULE,
  directionText,
  pickedText,
  playbookText,
} from '@/chat/playbook-text';
import { importedBookName, isReservedBookName } from '@/chat/reserved-book';

import { chatPlaybook, outlineBook, playbookRef, TEST_PLAYBOOK_ID } from '../helpers/llm';

const withOutline = (enabled: number | null = 0, phase = 'write'): PlaybookChat => ({
  playbook: playbookRef(phase),
  lorebooks: [outlineBook(['One', 'Two', 'Three'], enabled)],
});

const enabledOf = (patch: PlaybookChat | null): boolean[] =>
  patch === null ? [] : outlineSteps(patch).map((entry) => entry.enabled);

const definition = chatPlaybook().playbook;

describe('フェーズの文', () => {
  it('名前・役割・指示の決まり・フェーズと目的だけを置き、アウトラインの段は入れない', () => {
    const state = chatPlaybook();
    const text = playbookText({ ...state, playbook: { ...state.playbook, role: 'Be kind.' } });
    expect(text.split('\n')).toEqual([
      '[Playbook] Story',
      'Role: Be kind.',
      DIRECTION_RULE,
      'Phase: Plan (Make a plan)',
    ]);
  });

  it('##playbook の項目はどれも段として読む', () => {
    const book = outlineBook(['One'], 0);
    const memo = { ...book.entries[0]!, keys: ['memo'], comment: 'memo', enabled: false };
    const chat: PlaybookChat = { lorebooks: [{ ...book, entries: [...book.entries, memo] }] };
    expect(outlineSteps(chat)).toHaveLength(2);
    expect(enabledOf(withStep({ ...chat, playbook: playbookRef() }, 1))).toEqual([false, true]);
  });

  it('指示は空の段落を捨てて <direction> の行で囲む', () => {
    expect(directionText(['Go.', ' ', 'Rain.']).split('\n')).toEqual([
      '<direction>',
      'Go.',
      '',
      'Rain.',
      '</direction>',
    ]);
  });
});

describe('アウトラインの段', () => {
  it('今の段は有効な項目のうち並びで先の 1 つ。どれも切っていれば無い', () => {
    expect(currentStep(withOutline(1))).toBe(1);
    expect(currentStep(withOutline(null))).toBeNull();
  });

  it('次の段へは今の段を切って次を有効にする。最後か今の段が無ければ進めない', () => {
    expect(enabledOf(nextStep(withOutline(0)))).toEqual([false, true, false]);
    expect(nextStep(withOutline(2))).toBeNull();
    expect(nextStep(withOutline(null))).toBeNull();
    expect(enabledOf(prevStep(withOutline(1)))).toEqual([true, false, false]);
    expect(prevStep(withOutline(0))).toBeNull();
  });

  it('選んだ段だけを有効にし、全体を出すとすべてを有効にする', () => {
    expect(enabledOf(withStep(withOutline(0), 2))).toEqual([false, false, true]);
    expect(withStep(withOutline(0), 5)).toBeNull();
    expect(enabledOf(withAllSteps(withOutline(0)))).toEqual([true, true, true]);
  });

  it('進める段に入るとき、有効な段が無ければ先頭を有効にする。あればそのまま', () => {
    const entered = enterPhase(withOutline(null, 'plan'), definition, 'write');
    expect(entered?.playbook.phase).toBe('write');
    expect(enabledOf(entered)).toEqual([true, false, false]);
    expect(enabledOf(enterPhase(withOutline(2, 'plan'), definition, 'write'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(enterPhase(withOutline(0), definition, 'write')).toBeNull();
    expect(enterPhase(withOutline(0), definition, 'missing')).toBeNull();
  });

  it('段の題と本文を直すと、トリガーワードを *, 【題】 に合わせ直す', () => {
    const edited = editStep(withOutline(0), 1, { comment: 'Second', content: 'Body' });
    expect(outlineSteps(edited!)[1]).toMatchObject({
      comment: 'Second',
      content: 'Body',
      keys: ['【Second】'],
    });
  });

  it('段のトリガーワードは題を【】で囲み、区切りの文字は空白に替え、題が無ければ outline', () => {
    expect(stepKey({ comment: '起：出会い、別れ', content: '' })).toBe('【起：出会い 別れ】');
    expect(stepKey({ comment: '', content: '' })).toBe('outline');
    const book = outlineBook(['One', 'Two'], 0);
    const stale = book.entries.map((entry) => ({ ...entry, keys: ['outline'] }));
    expect(withStepKeys(stale).map((entry) => entry.keys)).toEqual([['【One】'], ['【Two】']]);
  });

  it('選ぶと参照と先頭のフェーズだけを持ち、##playbook を引き継いで最初の段から。無ければ足す', () => {
    const kept = startPlaybook(withOutline(2), definition);
    expect(kept.playbook).toEqual({ origin: 'own', id: TEST_PLAYBOOK_ID, phase: 'plan' });
    expect(kept.lorebooks).toHaveLength(1);
    expect(enabledOf(kept)).toEqual([true, false, false]);
    const fresh = startPlaybook({}, definition);
    expect(fresh.lorebooks.map((book) => book.name)).toEqual([PLAYBOOK_BOOK]);
  });

  it('外すと参照を消し、段はどれも切って ##playbook は残す', () => {
    const stopped = stopPlaybook(withOutline(1));
    expect(stopped?.playbook).toBeUndefined();
    expect(outlineSteps({ lorebooks: stopped?.lorebooks }).map((e) => e.enabled)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('応答から候補を読む', () => {
  it('番号付きの行を候補にし、最初の : までを見出しにする', () => {
    const read = candidatesFromText('Ideas:\n1. **Dawn**: a start\n   more\n2) Night\n');
    expect(read).toEqual([
      { title: 'Dawn', body: 'a start\nmore' },
      { title: 'Night', body: '' },
    ]);
    expect(candidatesFromText('none here')).toBeNull();
  });

  it('行の先頭の強調・見出しの印の後ろの番号も候補の始まりにする', () => {
    const read = candidatesFromText('**1. Dawn：a start**\n### 2. Night: end');
    expect(read?.map((item) => item.title)).toEqual(['Dawn', 'Night']);
    expect(read?.[0]?.body).toBe('a start');
  });

  it('どの候補も同じ見出しの語（指示の形の「題:」）なら、続きを見出しにする', () => {
    const read = candidatesFromText('1. 題: 潮騒の郵便局\n主人公\n2. 題: 星の漁師');
    expect(read?.map((item) => item.title)).toEqual(['潮騒の郵便局', '星の漁師']);
    expect(read?.[0]?.body).toBe('主人公');
  });

  it('選んだ候補は見出しの後ろに 1 行ずつ並べる。無ければ空', () => {
    const picked = pickedText(
      [
        { title: 'Dawn', body: 'a\nb' },
        { title: 'Dusk', body: '' },
      ],
      'Picked',
    );
    expect(picked.split('\n')).toEqual(['Picked:', '- Dawn: a b', '- Dusk']);
    expect(pickedText([], 'Picked')).toBe('');
  });
});

describe('予約の辞書の名前', () => {
  it('## で始まる名前を予約とし、取り込んだ辞書の名前からは先頭の # を外す', () => {
    expect(isReservedBookName(PLAYBOOK_BOOK)).toBe(true);
    expect(isReservedBookName(' # one')).toBe(false);
    expect(importedBookName('##playbook')).toBe('playbook');
    expect(importedBookName('World')).toBe('World');
  });
});
