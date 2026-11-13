import { describe, expect, it } from 'vitest';

import { appendTurn } from '@/chat/edit';
import { NO_SOURCES } from '@/chat/macros';
import {
  buildAdvisorRequest,
  buildChatRequest,
  toolFunction,
  withArgumentGuide,
} from '@/chat/request';
import type { GenerationParams } from '@/port/llm-port';

import { chat, chatMessage, llm } from '../helpers/llm';

// ─────────────────────────────
// 送る中身の組み立て。
// ─────────────────────────────

describe('送る中身', () => {
  it('システムプロンプトを先頭に置き、受け取る assistant の手前までを選んでいる候補で送る', () => {
    const base = chat([
      chatMessage('u1', 'user', ['hi']),
      chatMessage('a1', 'assistant', ['A', 'B'], 1),
    ]);
    const request = buildChatRequest(
      appendTurn(base, { text: 'next', userId: 'u2', assistantId: 'a2' }),
      llm(),
      {
        ...NO_SOURCES,
        systemPrompt: 'be brief',
      },
    );
    expect(request.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'next' },
    ]);
    expect(request.stream).toBe(true);
    expect(request.stream_options).toEqual({ include_usage: true });
    expect(request.model).toBe('model-a');
  });

  it('空のシステムプロンプトと空の本文は送らない', () => {
    const base = chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', [''])]);
    const request = buildChatRequest(
      appendTurn(base, { text: 'q', userId: 'u2', assistantId: 'a2' }),
      llm(),
      {
        ...NO_SOURCES,
        systemPrompt: '  ',
      },
    );
    expect(request.messages.map((message) => message.role)).toEqual(['user', 'user']);
  });

  it('決めた生成の項目だけを送り、仕様に無い項目と空の停止の文字列は落とす', () => {
    const params = { temperature: 0.2, top_k: 40, stop: ['', 'END'] } as GenerationParams;
    const request = buildChatRequest(
      appendTurn(chat([]), { text: 'q', userId: 'u', assistantId: 'a' }),
      llm(params),
    );
    expect(request).toMatchObject({ temperature: 0.2, stop: ['END'] });
    expect('top_k' in request).toBe(false);
    expect('top_p' in request).toBe(false);
  });
});
describe('添えた画像', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const jpg = 'data:image/jpeg;base64,/9j/4AAQ';

  it('画像を持つ user は content を部品の配列にし、本文を先に置く', () => {
    const request = buildChatRequest(
      appendTurn(chat([]), { text: 'look', userId: 'u', assistantId: 'a', images: [png, jpg] }),
      llm(),
    );
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: png } },
          { type: 'image_url', image_url: { url: jpg } },
        ],
      },
    ]);
  });

  it('本文が空でも画像があれば送り、画像だけの部品にする', () => {
    const request = buildChatRequest(
      appendTurn(chat([]), { text: '', userId: 'u', assistantId: 'a', images: [png] }),
      llm(),
    );
    expect(request.messages).toEqual([
      { role: 'user', content: [{ type: 'image_url', image_url: { url: png } }] },
    ]);
  });

  it('画像を持たない発言は文字列のまま。assistant の画像は送らない', () => {
    const base = chat([
      chatMessage('u1', 'user', ['hi'], 0, [png]),
      chatMessage('a1', 'assistant', ['A'], 0, [jpg]),
    ]);
    const request = buildChatRequest(
      appendTurn(base, { text: 'next', userId: 'u2', assistantId: 'a2' }),
      llm(),
    );
    expect(request.messages.map((message) => typeof message.content)).toEqual([
      'object',
      'string',
      'string',
    ]);
    expect(request.messages[1]).toEqual({ role: 'assistant', content: 'A' });
  });
});

describe('構成の相談の送る中身', () => {
  const messages = [{ role: 'user' as const, content: 'q' }];
  it('Web 検索を有効にしていれば Web のツールと手数の上限を付け、無ければ付けない', () => {
    const web = {
      mode: 'search' as const,
      calls: 3,
      tools: [{ type: 'openrouter:web_search' as const }],
    };
    const sent = buildAdvisorRequest(messages, { model: 'm', params: {} }, web);
    expect(sent.tools).toEqual([{ type: 'openrouter:web_search' }]);
    expect(sent.max_tool_calls).toBe(3);
    const plain = buildAdvisorRequest(messages, { model: 'm', params: {} });
    expect('tools' in plain || 'max_tool_calls' in plain).toBe(false);
  });
});

describe('ワークフローの関数の定義', () => {
  const tool = (description: string): { name: string; description: string } => ({
    name: 'make_image',
    description,
  });

  it('関数の形はすべての引数を必須にし、説明を添える', () => {
    const fn = toolFunction(tool('Makes one image.'), [
      { name: 'prompt', description: 'Tags', schema: { type: 'string' } },
      { name: 'steps', description: ' ', schema: { type: 'integer' } },
    ]);
    expect(fn.parameters.required).toEqual(['prompt', 'steps']);
    expect(fn.parameters.properties).toEqual({
      prompt: { type: 'string', description: 'Tags' },
      steps: { type: 'integer' },
    });
  });

  it('共通の追加指示は説明の後ろに空行を挟んで添え、空なら元のまま', () => {
    const fn = toolFunction(tool('Draw a picture.'), []);
    expect(withArgumentGuide(fn, ' Use tags. ').description).toBe('Draw a picture.\n\nUse tags.');
    expect(withArgumentGuide(fn, '  ')).toBe(fn);
    const bare = toolFunction(tool(''), []);
    expect(withArgumentGuide(bare, 'Use tags.').description).toBe('Use tags.');
  });
});
