import { describe, expect, it } from 'vitest';

import {
  appendTurn,
  chatNameFrom,
  editMessage,
  forkedChat,
  hasMessagesAfter,
  isStreaming,
  regenerate,
  removeMessage,
  respondWith,
  retry,
  rollback,
  sameExceptStreamingText,
  selectCandidate,
} from '@/chat/edit';
import { applyStreamEvents, finishStream } from '@/chat/stream-receive';

import { chat, chatMessage } from '../helpers/llm';

const answered = chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A'])]);

describe('送る', () => {
  it('user と受け取り中の assistant を足す', () => {
    const next = appendTurn(answered, { text: 'next', userId: 'u2', assistantId: 'a2' });
    expect(next.messages.map((message) => message.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(isStreaming(next)).toBe(true);
  });

  it('名前が空で最初の user のメッセージなら、本文から名前を付ける。2 通目からは変えない', () => {
    const empty = chat([chatMessage('a0', 'assistant', ['greeting'])]);
    const named = appendTurn(empty, {
      text: '\n  最初の 行\n2 行目',
      userId: 'u1',
      assistantId: 'a1',
    });
    expect(named.name).toBe('最初の 行');
    expect(
      appendTurn(chat([], { name: 'kept' }), { text: 'x', userId: 'u1', assistantId: 'a1' }).name,
    ).toBe('kept');
    expect(appendTurn(answered, { text: 'second', userId: 'u2', assistantId: 'a2' }).name).toBe('');
  });
});

describe('本文から作る名前', () => {
  it('見た目の幅で半角 20 字まで（全角は 2）。「…」は付けない', () => {
    expect(chatNameFrom('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnopqrst');
    expect(chatNameFrom('あいうえおかきくけこさしすせそ')).toBe('あいうえおかきくけこ');
    expect(chatNameFrom('ab あいうえおかきくけこ')).toBe('ab あいうえおかきく');
    expect(chatNameFrom('ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆ')).toBe('ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ');
    expect(chatNameFrom('  \n ')).toBe('');
  });
});

describe('受け取り', () => {
  it('届いた本文と思考を足し、終えたときに届いた終わり方で閉じる', () => {
    let next = appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' });
    next = applyStreamEvents(next, [
      { kind: 'delta', content: 'He', reasoning: 'r' },
      { kind: 'finish', reason: 'length' },
      { kind: 'delta', content: 'llo', reasoning: '' },
    ]);
    expect(isStreaming(next)).toBe(true);
    next = finishStream(next, null);
    const candidate = next.messages.at(-1)?.candidates[0];
    expect(candidate?.content).toBe('Hello');
    expect(candidate?.reasoning).toBe('r');
    expect(candidate?.end).toEqual({ kind: 'done', reason: 'length' });
  });

  it('止めたら受け取った分を残して印を付け、失敗なら原因を残す', () => {
    const streaming = applyStreamEvents(
      appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' }),
      [{ kind: 'delta', content: 'part', reasoning: '' }],
    );
    const stopped = finishStream(streaming, { kind: 'stopped' });
    expect(stopped.messages.at(-1)?.candidates[0]).toMatchObject({
      content: 'part',
      end: { kind: 'stopped' },
    });
    const failed = finishStream(streaming, { kind: 'server', status: 500 });
    expect(failed.messages.at(-1)?.candidates[0]?.end).toEqual({
      kind: 'failed',
      failure: { kind: 'server', status: 500 },
    });
  });
});

describe('生成し直す', () => {
  it('最後の assistant に候補を足して選ぶ。ほかの候補は消さない', () => {
    const next = regenerate(answered);
    const last = next?.messages.at(-1);
    expect(last?.candidates.map((candidate) => candidate.content)).toEqual(['A', '']);
    expect(last?.selected).toBe(1);
    expect(next === null ? false : isStreaming(next)).toBe(true);
  });

  it('指示があれば、今の候補を土台にした候補にする。失敗してもう一度でも持ったまま', () => {
    const next = regenerate(answered, 'Shorter.');
    expect(next?.messages.at(-1)?.candidates[1]?.revision).toEqual({
      base: 0,
      instruction: 'Shorter.',
    });
    expect(regenerate(answered, '  ')?.messages.at(-1)?.candidates[1]?.revision).toBeUndefined();
    const failed = next === null ? answered : finishStream(next, { kind: 'server', status: 500 });
    expect(retry(failed)?.messages.at(-1)?.candidates[1]?.revision?.instruction).toBe('Shorter.');
  });

  it('最後が user のときと受け取り中は受け付けない', () => {
    expect(regenerate(chat([chatMessage('u1', 'user', ['hi'])]))).toBeNull();
    expect(
      regenerate(appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' })),
    ).toBeNull();
  });

  it('ロールバックは、その user から後ろを消して本文を返し、受け取りは始めない', () => {
    const long = chat([...answered.messages, chatMessage('u2', 'user', ['q2'])]);
    expect(hasMessagesAfter(long, 'u1')).toBe(true);
    const back = rollback(long, 'u1');
    expect(back?.chat.messages).toEqual([]);
    expect(back?.content).toBe('hi');
    expect(back?.images).toEqual([]);
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const pictured = chat([chatMessage('u9', 'user', ['see'], 0, [png])]);
    expect(rollback(pictured, 'u9')?.images).toEqual([png]);
    const ids = rollback(long, 'u2')?.chat.messages.map((message) => message.id);
    expect(ids).toEqual(['u1', 'a1']);
    expect(rollback(long, 'a1')).toBeNull();
  });

  it('フォークの写しは、その assistant までを残す。user と受け取り中は受け付けない', () => {
    const long = chat([...answered.messages, chatMessage('u2', 'user', ['q2'])]);
    expect(forkedChat(long, 'a1')?.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(forkedChat(long, 'u2')).toBeNull();
    expect(
      forkedChat(appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' }), 'a1'),
    ).toBeNull();
  });
});

describe('候補・編集・消す', () => {
  const swiped = chat([
    chatMessage('u1', 'user', ['hi']),
    chatMessage('a1', 'assistant', ['A', 'B'], 1),
  ]);

  it('候補を切り替える。範囲の外と同じ番号は受け付けない', () => {
    expect(selectCandidate(swiped, 'a1', 0)?.messages[1]?.selected).toBe(0);
    expect(selectCandidate(swiped, 'a1', 2)).toBeNull();
    expect(selectCandidate(swiped, 'a1', 1)).toBeNull();
  });

  it('選んでいる候補だけを書き換え、以降のメッセージは消さない', () => {
    const next = editMessage(swiped, 'a1', 'B2');
    expect(next?.messages[1]?.candidates.map((candidate) => candidate.content)).toEqual([
      'A',
      'B2',
    ]);
    expect(editMessage(swiped, 'a1', 'B')).toBeNull();
  });

  it('そのメッセージだけを消す', () => {
    expect(removeMessage(swiped, 'u1')?.messages.map((message) => message.id)).toEqual(['a1']);
  });
});

describe('直前の応答にする', () => {
  it('いつも assistant の発言として最後に足し、直前の応答は残す', () => {
    const answered = chat([
      chatMessage('u1', 'user', ['hi']),
      chatMessage('a1', 'assistant', ['A']),
    ]);
    const added = respondWith(answered, ['Greeting.'], 0, 'x');
    expect(added?.messages.map((message) => [message.id, message.candidates[0]?.content])).toEqual([
      ['u1', 'hi'],
      ['a1', 'A'],
      ['x', 'Greeting.'],
    ]);

    const asked = respondWith(chat([chatMessage('u1', 'user', ['hi'])]), ['Greeting.'], 0, 'x');
    expect(asked?.messages.map((message) => [message.id, message.role])).toEqual([
      ['u1', 'user'],
      ['x', 'assistant'],
    ]);
    expect(respondWith(answered, ['  '], 0, 'x')).toBeNull();
  });

  it('初期メッセージを全部候補にし、見ている頁を選ぶ（空の頁は候補にしない）', () => {
    const added = respondWith(chat([]), ['A', ' ', 'C'], 2, 'x');
    const message = added?.messages[0];
    expect(message?.candidates.map((candidate) => candidate.content)).toEqual(['A', 'C']);
    expect(message?.selected).toBe(1);
  });
});

describe('受け取り中の本文だけの違い', () => {
  const streaming = appendTurn(answered, { text: 'q', userId: 'u2', assistantId: 'a2' });
  const delta = (text: string) => ({ kind: 'delta' as const, content: text, reasoning: 'r' });

  it('本文と思考が届いただけなら同じとみなす', () => {
    const next = applyStreamEvents(streaming, [delta('He')]);
    expect(sameExceptStreamingText(streaming, next)).toBe(true);
  });

  it('使用量が届いた・受け取りを終えた・ほかが変わったなら違う', () => {
    const usage = applyStreamEvents(streaming, [
      { kind: 'usage', usage: { prompt: 10, completion: 2 } },
    ]);
    expect(sameExceptStreamingText(streaming, usage)).toBe(false);
    expect(sameExceptStreamingText(streaming, finishStream(streaming, null))).toBe(false);
    expect(sameExceptStreamingText(streaming, { ...streaming, name: 'x' })).toBe(false);
  });

  it('受け取り中でなければ、同じ物のときだけ同じ', () => {
    expect(sameExceptStreamingText(answered, answered)).toBe(true);
    expect(sameExceptStreamingText(answered, { ...answered })).toBe(false);
  });
});
