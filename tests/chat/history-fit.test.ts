import { describe, expect, it } from 'vitest';

import { assembleParts, mergeParts, summarizedCount } from '@/chat/assemble';
import { parseChat } from '@/chat/file';
import { NO_SOURCES } from '@/chat/macros';
import { buildSummaryRequest, SUMMARY_MAX_TOKENS } from '@/chat/request';
import { fitSummaryRange, SUMMARY_KEEP, summaryMessages, summaryRange } from '@/chat/summary';
import {
  calibration,
  estimateChat,
  fitDrop,
  IMAGE_TOKENS,
  inputLimitOf,
  isNearInputLimit,
  planSend,
} from '@/chat/tokens';
import type { Chat, ChatMessage } from '@/chat/types';
import { parseContextOverflow } from '@/llm/schema';

import { chat, chatMessage, chatTurns, contentText } from '../helpers/llm';

// ─────────────────────────────
// 上限に収める古い履歴の外し方と、会話履歴の要約
// ─────────────────────────────

/** 受け取る `assistant` を末尾に足した、送るときの形 */
function sending(base: Chat): Chat {
  const receiving: ChatMessage = {
    id: 'r',
    role: 'assistant',
    candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
    selected: 0,
  };
  return { ...base, messages: [...base.messages, receiving] };
}

const sent = (shape: Chat, drop = 0): string =>
  mergeParts(assembleParts(shape, shape.prompt, undefined, drop))
    .map(contentText)
    .join('|');

describe('文脈の上限の断り', () => {
  it('llama.cpp の n_ctx と n_prompt_tokens を読む', () => {
    const raw = {
      error: {
        code: 400,
        message: 'the request exceeds the available context size, try increasing it',
        type: 'exceed_context_size_error',
        n_prompt_tokens: 5120,
        n_ctx: 4096,
      },
    };
    expect(parseContextOverflow(raw)).toEqual({ context: 4096, prompt: 5120 });
  });

  it('OpenAI 互換の文から上限と送った数を読む（生成する分は引く）', () => {
    const openai = {
      error: {
        message:
          "This model's maximum context length is 8,192 tokens. However, your messages " +
          'resulted in 9,000 tokens. Please reduce the length of the messages.',
      },
    };
    expect(parseContextOverflow(openai)).toEqual({ context: 8192, prompt: 9000 });
    const vllm = {
      message:
        "This model's maximum context length is 4096 tokens. However, you requested 5000 tokens " +
        '(4000 in the messages, 1000 in the completion).',
    };
    expect(parseContextOverflow(vllm)).toEqual({ context: 4096, prompt: 4000 });
    const router = {
      error: {
        message:
          "This endpoint's maximum context length is 32768 tokens. However, you requested about " +
          '40000 tokens (39000 of text input, 1000 in the output).',
      },
    };
    expect(parseContextOverflow(router)).toEqual({ context: 32768, prompt: 39000 });
  });

  it('「N tokens > M maximum」の文から読む（FreeToken の実際の断り）', () => {
    const raw = {
      error: {
        message:
          'prompt is too long: 9013 tokens > 8211 maximum (prompt + generation); shorten the ' +
          'prompt or increase the KV cache budget',
        code: 'context_length_exceeded',
      },
    };
    expect(parseContextOverflow(raw)).toEqual({ context: 8211, prompt: 9013 });
  });

  it('上限の読めない断りは undefined', () => {
    expect(parseContextOverflow({ error: { message: 'model not found' } })).toBeUndefined();
    expect(parseContextOverflow('oops')).toBeUndefined();
  });
});

describe('古い履歴を外す', () => {
  it('要約していない発言を古い方から外し、最後の 1 件は外さない', () => {
    const shape = sending(chat(chatTurns(4)));
    expect(sent(shape, 2)).not.toContain('m0 ');
    expect(sent(shape, 2)).not.toContain('m1 ');
    expect(sent(shape, 2)).toContain('m2 ');
    // 外せるのは 3 件まで（最後の m3 は残す）
    expect(sent(shape, 99)).toBe(sent(shape, 3));
    expect(sent(shape, 3)).toContain('m3 ');
  });

  it('上限に収まる最小の件数を探し、上限が分からなければ外さない', () => {
    const shape = sending(chat(chatTurns(10)));
    const tools = 0;
    expect(
      fitDrop(
        { chat: shape, composition: shape.prompt, sources: NO_SOURCES },
        { limit: null, tools },
        1,
      ),
    ).toBe(0);
    const whole = planSend(
      { chat: shape, composition: shape.prompt, sources: NO_SOURCES },
      { limit: null, tools },
      1,
    ).estimate;
    const drop = fitDrop(
      { chat: shape, composition: shape.prompt, sources: NO_SOURCES },
      { limit: whole * 0.6, tools },
      1,
    );
    expect(drop).toBeGreaterThan(0);
    const fitted = planSend(
      { chat: shape, composition: shape.prompt, sources: NO_SOURCES },
      { limit: whole * 0.6, tools },
      1,
    );
    expect(fitted.drop).toBe(drop);
    expect(fitted.estimate).toBeLessThanOrEqual(whole * 0.6);
    // ワークフローの定義の分も上限から引く
    const withTools = fitDrop(
      { chat: shape, composition: shape.prompt, sources: NO_SOURCES },
      { limit: whole * 0.6, tools: 50 },
      1,
    );
    expect(withTools).toBeGreaterThan(drop);
  });

  it('見積もりは外した後の形で数え、件数を返す', () => {
    const base = chat(chatTurns(10));
    const whole = estimateChat(base, base.prompt);
    expect(whole).toMatchObject({ drop: 0, kept: 10, summarized: 0 });
    const fitted = estimateChat(base, base.prompt, undefined, {
      limit: Math.floor(whole.total / 2),
      tools: 0,
    });
    expect(fitted.drop).toBeGreaterThan(0);
    expect(fitted.kept).toBe(10 - fitted.drop);
    expect(fitted.total).toBeLessThanOrEqual(whole.total / 2);
  });
});

describe('補正の比', () => {
  it('送ったときの見積もりで割り、断られた候補は送った数を使う', () => {
    const answered: ChatMessage = {
      ...chatMessage('a1', 'assistant', ['ok']),
      candidates: [
        {
          content: 'ok',
          reasoning: '',
          end: { kind: 'done', reason: null },
          usage: { prompt: 200, completion: 1 },
          sentEstimate: 100,
        },
      ],
    };
    const base = chat([...chatTurns(1), answered]);
    expect(calibration(base, base.prompt, NO_SOURCES).ratio).toBe(2);

    const refused: ChatMessage = {
      ...chatMessage('a1', 'assistant', ['']),
      candidates: [
        {
          content: '',
          reasoning: '',
          end: {
            kind: 'failed',
            failure: { kind: 'rejected', overflow: { context: 100, prompt: 150 } },
          },
          sentEstimate: 100,
        },
      ],
    };
    const failed = chat([...chatTurns(1), refused]);
    expect(calibration(failed, failed.prompt, NO_SOURCES)).toEqual({ ratio: 1.5, actual: 150 });
  });
});

describe('要約', () => {
  it('縮めた発言の代わりに、要約を履歴の先頭に system で置く', () => {
    const base = chat(chatTurns(6), { summary: { content: 'They met.', upTo: 'm2' } });
    const shape = sending(base);
    expect(summarizedCount(shape)).toBe(3);
    const messages = mergeParts(assembleParts(shape, shape.prompt));
    expect(messages[0]).toEqual({ role: 'system', content: '[Summary: They met.]' });
    expect(messages.map(contentText).join('|')).not.toContain('m2 ');
    expect(messages.map(contentText).join('|')).toContain('m3 ');
    // 外すのは要約していない発言から
    expect(sent(shape, 1)).not.toContain('m3 ');
    expect(sent(shape, 1)).toContain('[Summary: They met.]');
  });

  it('本文の空の要約・指す発言の無い要約は使わない', () => {
    const empty = sending(chat(chatTurns(6), { summary: { content: ' ', upTo: 'm2' } }));
    expect(summarizedCount(empty)).toBe(0);
    expect(sent(empty)).toContain('m0 ');
    const lost = sending(chat(chatTurns(6), { summary: { content: 'x', upTo: 'gone' } }));
    expect(summarizedCount(lost)).toBe(0);
  });

  it('新しい 4 件を残して、要約した後ろから縮める', () => {
    expect(summaryRange(chat(chatTurns(SUMMARY_KEEP)))).toBeNull();
    expect(summaryRange(chat(chatTurns(10)))).toEqual({ from: 0, to: 10 - SUMMARY_KEEP });
    const summarized = chat(chatTurns(10), { summary: { content: 'S', upTo: 'm3' } });
    expect(summaryRange(summarized)).toEqual({ from: 4, to: 6 });
  });

  it('前の要約と縮める発言を「名前: 本文」で渡し、停止の文字列は付けない', () => {
    const base = chat(chatTurns(10), { summary: { content: 'Earlier.', upTo: 'm3' } });
    const sources = { userName: 'Kei', charName: 'Aria', markerText: () => '' };
    const messages = summaryMessages(base, sources, { from: 4, to: 6 });
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.content).toContain('<previous_summary>\nEarlier.\n</previous_summary>');
    expect(messages[1]?.content).toContain('<conversation>');
    expect(messages[1]?.content).toContain('Kei: m4 ');
    expect(messages[1]?.content).toContain('Aria: m5 ');
    expect(messages[1]?.content).not.toContain('m6 ');
    const params = { stop: ['\n'], max_tokens: 300 };
    const request = buildSummaryRequest(messages, { model: 'm', params });
    expect(request).not.toHaveProperty('stop');
    // 名前にも戻すの行を掛ける
    const restore = { id: 'r', name: 'Cat', value: 'Aria', restore: true as const };
    const renamed = summaryMessages(base, { ...sources, variables: [restore] }, { from: 4, to: 6 });
    expect(renamed[1]?.content).toContain('Cat: m5 ');
    // 会話の max_tokens（返答の長さ）ではなく要約用の上限
    expect(request.max_tokens).toBe(SUMMARY_MAX_TOKENS);
    expect(request).not.toHaveProperty('tools');
  });

  it('上限に収まる分だけ古い方から縮める（少なくとも 1 件）', () => {
    const base = chat(chatTurns(20, 200));
    const sources = { userName: 'U', charName: 'A', markerText: () => '' };
    const range = summaryRange(base)!;
    expect(fitSummaryRange(base, sources, range, { limit: null, ratio: 1 })).toEqual(range);
    const fitted = fitSummaryRange(base, sources, range, { limit: 300, ratio: 1 });
    expect(fitted.from).toBe(0);
    expect(fitted.to).toBeGreaterThan(0);
    expect(fitted.to).toBeLessThan(range.to);
    expect(fitSummaryRange(base, sources, range, { limit: 1, ratio: 1 })).toEqual({
      from: 0,
      to: 1,
    });
  });
});

describe('読み戻し', () => {
  it('要約・送ったときの見積もり・外した件数・断りの上限を残す', () => {
    const raw = {
      messages: [
        {
          id: 'a',
          role: 'assistant',
          selected: 0,
          candidates: [
            {
              content: '',
              end: {
                kind: 'failed',
                failure: { kind: 'rejected', overflow: { context: 4096, prompt: 5000 } },
              },
              sentEstimate: 120,
              trimmed: 3,
            },
          ],
        },
      ],
      summary: { content: 'S', upTo: 'a' },
    };
    const read = parseChat(raw);
    expect(read?.summary).toEqual({ content: 'S', upTo: 'a' });
    expect(read?.messages[0]?.candidates[0]).toMatchObject({
      sentEstimate: 120,
      trimmed: 3,
      end: { failure: { overflow: { context: 4096, prompt: 5000 } } },
    });
  });
});
describe('画像の見積もり', () => {
  it('画像 1 枚を決めた数で数え、履歴にも全体にも入れる', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const plain = chat([chatMessage('u1', 'user', ['hi'])]);
    const withImage = chat([chatMessage('u1', 'user', ['hi'], 0, [png, png])]);
    const a = estimateChat(plain, plain.prompt);
    const b = estimateChat(withImage, withImage.prompt);
    expect(b.history - a.history).toBe(2 * IMAGE_TOKENS);
    expect(b.total - a.total).toBe(2 * IMAGE_TOKENS);
  });
});
describe('返答の分と、上限に近い知らせ', () => {
  it('max_tokens が無ければ文脈長の 4 分の 1（4096 まで）を返答の分として引く', () => {
    expect(inputLimitOf(8000, undefined)).toBe(6000);
    expect(inputLimitOf(131072, undefined)).toBe(131072 - 4096);
    expect(inputLimitOf(8000, 1000)).toBe(7000);
    expect(inputLimitOf(null, undefined)).toBeNull();
  });

  it('使った数（送った分と返答の分）が上限の 8 割以上なら近い。数が無ければ送るときの見積もりで見る', () => {
    const done = { content: 'x', reasoning: '', end: { kind: 'done', reason: null } } as const;
    const used = (prompt: number, completion: number) => ({
      ...done,
      usage: { prompt, completion },
    });
    expect(isNearInputLimit(used(4000, 800), 6000)).toBe(true);
    expect(isNearInputLimit(used(4000, 700), 6000)).toBe(false);
    expect(isNearInputLimit({ ...done, sentEstimate: 5000 }, 6000)).toBe(true);
    expect(isNearInputLimit(done, 6000)).toBe(false);
    expect(isNearInputLimit(used(9000, 0), null)).toBe(false);
  });
});
