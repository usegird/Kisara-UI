import { describe, expect, it } from 'vitest';

import { assembleParts, mergeParts } from '@/chat/assemble';
import { parseCandidate } from '@/chat/candidate-parse';
import { writeReply } from '@/chat/edit';
import { NO_SOURCES } from '@/chat/macros';
import { buildChatRequest } from '@/chat/request';
import { applyStreamEvents, finishStream } from '@/chat/stream-receive';
import { editedArguments, parseToolArguments } from '@/chat/tool-arguments';
import { findQueuedCall, queuedToolCalls, restartToolCall } from '@/chat/tool-calls';
import {
  imageReferenceOf,
  RECEIVED_IMAGE_LIMIT,
  receivedImages,
  toolCallRuns,
  toolResultText,
} from '@/chat/tool-results';
import type { ChatMessage, ToolCallRecord, ToolCallState } from '@/chat/types';
import { parseCompletionChunk } from '@/llm/schema';
import type { ToolDefinition } from '@/port/llm-port';

import { chat, chatMessage, llm, toolCallMessage } from '../helpers/llm';

// ─────────────────────────────
// ワークフローの呼び出しの列。受け取り・確かめ・続き・送る中身への展開・読み戻し。
// ─────────────────────────────

function call(id: string, state: ToolCallState, name = 'make_image'): ToolCallRecord {
  return { id, name, arguments: '{"prompt":"cat"}', state };
}

const streaming: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
  selected: 0,
};

describe('受け取りと確かめ', () => {
  it('断片を番号ごとにつなぎ、終えたら確かめた状態にする', () => {
    let next = applyStreamEvents(chat([chatMessage('u1', 'user', ['hi']), streaming]), [
      { kind: 'tool-call', index: 0, id: 'call_1', name: 'make_', arguments: '{"pro' },
      { kind: 'tool-call', index: 0, id: '', name: 'image', arguments: 'mpt":"cat"}' },
    ]);
    next = finishStream(next, null, () => ({ kind: 'waiting' }));
    expect(next.messages.at(-1)?.candidates[0]?.toolCalls).toEqual([
      call('call_1', { kind: 'waiting' }),
    ]);
  });

  it('止めた受け取りの呼び出しは本文が欠けるので外す', () => {
    const received = applyStreamEvents(chat([streaming]), [
      { kind: 'tool-call', index: 0, id: 'c', name: 'make_image', arguments: '{' },
    ]);
    const stopped = finishStream(received, { kind: 'stopped' });
    expect(stopped.messages[0]?.candidates[0]?.toolCalls).toBeUndefined();
  });

  it('ストリーミングの断片と 1 つの JSON の呼び出しを読む', () => {
    const delta = { choices: [{ delta: { tool_calls: [{ index: 1, id: 'x', function: {} }] } }] };
    expect(parseCompletionChunk(delta)).toEqual([
      { kind: 'tool-call', index: 1, id: 'x', name: '', arguments: '' },
    ]);
    const whole = {
      choices: [
        {
          message: { tool_calls: [{ id: 'y', function: { name: 'f', arguments: { a: 1 } } }] },
          finish_reason: 'tool_calls',
        },
      ],
    };
    expect(parseCompletionChunk(whole)[0]).toEqual({
      kind: 'tool-call',
      index: 0,
      id: 'y',
      name: 'f',
      arguments: '{"a":1}',
    });
  });
});

describe('送る中身', () => {
  const tools: ToolDefinition[] = [
    { type: 'function', function: { name: 'make_image', description: '', parameters: {} } },
  ];
  const history = chat([
    chatMessage('u1', 'user', ['draw']),
    toolCallMessage('a1', [call('c1', { kind: 'queued', promptId: 'p1' })]),
    streaming,
  ]);

  // 前の応答の呼び出しを履歴に入れる形（既定は入れない）
  const withCalls = { ...NO_SOURCES, toolHistory: true };

  it('呼び出しを tool_calls と tool の発言に分け、tools を添える', () => {
    const request = buildChatRequest(history, llm(), withCalls, { tools });
    expect(request.tools).toEqual(tools);
    expect(request.messages.slice(1)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'make_image', arguments: '{"prompt":"cat"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'c1',
        content: toolResultText({ kind: 'queued', promptId: 'p1' }),
      },
    ]);
    expect(buildChatRequest(history, llm()).tools).toBeUndefined();
  });
  it('JSON の物として読めない引数は {} にして送る', () => {
    const argumentsSent = (raw: string): unknown => {
      const broken = {
        ...call('c1', { kind: 'invalid', problem: { code: 'json' } }),
        arguments: raw,
      };
      const sent = buildChatRequest(
        chat([chatMessage('u1', 'user', ['draw']), toolCallMessage('a1', [broken]), streaming]),
        llm(),
        withCalls,
        { tools },
      ).messages[1];
      return sent !== undefined && 'tool_calls' in sent
        ? sent.tool_calls[0]?.function.arguments
        : null;
    };
    expect(['', '{"prompt"', '[1]', '"x"'].map(argumentsSent)).toEqual(['{}', '{}', '{}', '{}']);
    expect(argumentsSent('{"prompt":"cat"}')).toBe('{"prompt":"cat"}');
  });

  it('既定では、呼び出しと結果を送らず本文だけを送る', () => {
    // 本文が空の応答は、その発言ごと送らない
    const roles = buildChatRequest(history, llm(), undefined, { tools }).messages.map(
      (m) => m.role,
    );
    expect(roles).toEqual(['user']);
    const replied = toolCallMessage('a1', [call('c1', { kind: 'queued', promptId: 'p1' })]);
    const texted = chat([
      chatMessage('u1', 'user', ['draw']),
      {
        ...replied,
        candidates: replied.candidates.map((item) => ({ ...item, content: 'Here.' })),
      },
      streaming,
    ]);
    const sent = buildChatRequest(texted, llm()).messages.slice(1);
    expect(sent).toEqual([{ role: 'assistant', content: 'Here.' }]);
  });

  it('深さ 0 の差し込みは呼び出しと結果の間に入らない', () => {
    const composition = {
      ...history.prompt,
      items: [
        ...history.prompt.items,
        {
          id: 'note',
          name: '',
          role: 'system' as const,
          marker: null,
          content: 'Note',
          enabled: true,
          position: { kind: 'depth' as const, depth: 1, order: 0 },
        },
      ],
    };
    const parts = assembleParts(history, composition, withCalls);
    const roles = mergeParts(parts).map((message) => message.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'system']);
  });

  it('LLM に返す結果は状態と、受け取った画像の参照名だけ', () => {
    expect(JSON.parse(toolResultText({ kind: 'done', images: [] }))).toEqual({
      status: 'completed',
    });
    const images = [{ filename: 'a.png', subfolder: 'x', type: 'output' }];
    expect(JSON.parse(toolResultText({ kind: 'done', images }))).toEqual({
      status: 'completed',
      images: ['output/x/a.png'],
    });
    expect(JSON.parse(toolResultText({ kind: 'declined' }))).toMatchObject({ status: 'declined' });
    expect(JSON.parse(toolResultText({ kind: 'unknown', promptId: 'p1' }))).toMatchObject({
      status: 'unknown',
    });
  });

  it('不明の呼び出しは実行の id ごと引ける（完了待ちとは分けて）', () => {
    const unknown = chat([
      toolCallMessage('a1', [call('c1', { kind: 'unknown', promptId: 'p1', outputs: ['9'] })]),
    ]);
    expect(queuedToolCalls(unknown)).toEqual([]);
    expect(queuedToolCalls(unknown, 'unknown')).toEqual([
      { messageId: 'a1', callId: 'c1', promptId: 'p1', outputs: ['9'] },
    ]);
    expect(findQueuedCall(unknown, 'p1', 'unknown')?.call.id).toBe('c1');
    expect(findQueuedCall(unknown, 'p1')).toBeNull();
  });
});
describe('本文を書かせる', () => {
  const tools: ToolDefinition[] = [
    { type: 'function', function: { name: 'make_image', description: '', parameters: {} } },
  ];
  const calledOnly = (): ChatMessage => {
    const message = toolCallMessage('a1', [call('c1', { kind: 'queued', promptId: 'p1' })]);
    return {
      ...message,
      candidates: message.candidates.map((item) => ({ ...item, reasoning: 'Plan' })),
    };
  };
  const asked = chat([chatMessage('u1', 'user', ['draw']), calledOnly()]);

  it('呼び出しだけの最後の応答を、呼び出しを持ったまま受け取り中に戻す。本文があれば戻さない', () => {
    const next = writeReply(asked);
    const candidate = next?.messages.at(-1)?.candidates[0];
    expect(candidate?.end.kind).toBe('streaming');
    expect(candidate?.toolCalls?.map((item) => item.id)).toEqual(['c1']);
    expect(candidate?.reasoning).toBe('Plan\n\n');
    const texted = chat([
      chatMessage('u1', 'user', ['draw']),
      { ...calledOnly(), candidates: [{ ...calledOnly().candidates[0]!, content: 'Here.' }] },
    ]);
    expect(writeReply(texted)).toBeNull();
    expect(writeReply(chat([chatMessage('u1', 'user', ['draw'])]))).toBeNull();
  });

  it('呼び出しと今の状態を末尾に置き、ツールは送ったまま呼ばせない', () => {
    const request = buildChatRequest(writeReply(asked)!, llm(), undefined, { tools });
    expect(request.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool']);
    expect(request.messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'c1',
      content: toolResultText({ kind: 'queued', promptId: 'p1' }),
    });
    expect(request.tool_choice).toBe('none');
    // ふつうの送信では呼ばせないにしない
    expect(buildChatRequest(history(), llm(), undefined, { tools }).tool_choice).toBeUndefined();
  });

  it('書かせている間に届いた呼び出しは足さず、本文と思考を受け取る', () => {
    const received = applyStreamEvents(writeReply(asked)!, [
      { kind: 'tool-call', index: 0, id: 'x', name: 'other', arguments: '{}' },
      { kind: 'delta', content: 'Hello', reasoning: 'More' },
    ]);
    const candidate = received.messages.at(-1)?.candidates[0];
    expect(candidate?.toolCalls).toEqual(calledOnly().candidates[0]?.toolCalls);
    expect(candidate?.content).toBe('Hello');
    expect(candidate?.reasoning).toBe('Plan\n\nMore');
  });
});

function history(): ReturnType<typeof chat> {
  return chat([chatMessage('u1', 'user', ['draw']), streaming]);
}

describe('実行し直す', () => {
  const user = chatMessage('u1', 'user', ['draw a cat']);
  const done: ToolCallState = { kind: 'done', images: [] };

  it('今の実行を前の実行に残し、新しい引数で承諾を待つ', () => {
    const base = chat([user, toolCallMessage('a1', [call('c1', done)])]);
    const restarted = restartToolCall(base, 'a1', 'c1', '{"prompt":"dog"}');
    const rerun = restarted?.messages[1]?.candidates[0]?.toolCalls?.[0];
    expect(rerun?.state.kind).toBe('waiting');
    expect(rerun === undefined ? [] : toolCallRuns(rerun).map((run) => run.arguments)).toEqual([
      '{"prompt":"cat"}',
      '{"prompt":"dog"}',
    ]);
  });

  it('承諾を待つ呼び出しは引数だけを差し替え、前の実行に残さない', () => {
    const base = chat([user, toolCallMessage('a1', [call('c1', { kind: 'waiting' })])]);
    const rerun = restartToolCall(base, 'a1', 'c1', '{}')?.messages[1]?.candidates[0]
      ?.toolCalls?.[0];
    expect(rerun?.arguments).toBe('{}');
    expect(rerun?.previousRuns).toBeUndefined();
  });

  it('直した値を重ねる。元が文字なら文字のまま、ほかは JSON として読む', () => {
    const raw = '{"prompt":"cat","steps":20}';
    const edits = new Map([
      ['prompt', '42'],
      ['steps', '30'],
    ]);
    expect(JSON.parse(editedArguments(raw, edits))).toEqual({ prompt: '42', steps: 30 });
    expect(editedArguments('not json', edits)).toBe('not json');
  });
});

describe('読み戻し', () => {
  it('前の実行の列を読み戻す', () => {
    const candidate = parseCandidate({
      content: '',
      end: { kind: 'done', reason: null },
      toolCalls: [{ ...call('c1', { kind: 'declined' }), previousRuns: [{ arguments: '{}' }, 1] }],
    });
    const runs = candidate?.toolCalls?.[0]?.previousRuns;
    expect(runs?.map((run) => run.state.kind)).toEqual(['failed']);
  });

  it('作らせた応答の記録を読み戻し、数でない項目は落とす', () => {
    const generation = {
      reasoning: 'think',
      usage: { prompt: 10, completion: 'x' },
      timing: { firstMs: 100, receivingMs: 200 },
    };
    const candidate = parseCandidate({
      content: '',
      end: { kind: 'done', reason: null },
      toolCalls: [{ ...call('c1', { kind: 'declined' }), generation }],
    });
    const read = candidate?.toolCalls?.[0]?.generation;
    expect(read?.reasoning).toBe('think');
    expect(read?.usage).toBeUndefined();
    expect(read?.timing).toEqual({ firstMs: 100, receivingMs: 200 });
  });

  it('呼び出しの列と完了した画像の参照を読み戻す', () => {
    const images = [{ filename: 'a.png', subfolder: '', type: 'output' }];
    const candidate = parseCandidate({
      content: '',
      end: { kind: 'done', reason: null },
      toolCalls: [call('c1', { kind: 'done', images }), { id: 1 }],
    });
    expect(candidate?.toolCalls).toEqual([call('c1', { kind: 'done', images })]);
  });

  it('不明の呼び出しを実行の id ごと読み戻す。id が無ければ失敗にする', () => {
    const unknown = { kind: 'unknown', promptId: 'p1', outputs: ['9'] } as const;
    const read = (state: unknown) =>
      parseCandidate({
        content: '',
        end: { kind: 'done', reason: null },
        toolCalls: [{ ...call('c1', unknown), state }],
      })?.toolCalls?.[0]?.state;
    expect(read(unknown)).toEqual(unknown);
    expect(read({ kind: 'unknown' })?.kind).toBe('failed');
  });
});
describe('受け取った画像', () => {
  const file = (filename: string, type = 'output') => ({ filename, subfolder: '', type });
  const done = (id: string, names: readonly string[]): ToolCallRecord =>
    call(id, { kind: 'done', images: names.map((name) => file(name)) });

  it('選んだ候補の完了した呼び出しの画像を古い順に集め、同じものは新しい方にまとめる', () => {
    const talk = chat([
      toolCallMessage('a1', [done('c1', ['a.png', 'b.png']), call('c2', { kind: 'declined' })]),
      toolCallMessage('a2', [done('c3', ['a.png'])]),
    ]);
    expect(receivedImages(talk).map((image) => image.reference)).toEqual([
      'output/b.png',
      'output/a.png',
    ]);
    expect(imageReferenceOf({ filename: 'x.png', subfolder: 'k', type: 'temp' })).toBe(
      'temp/k/x.png',
    );
  });

  it('上限を超えたら新しいものから残す', () => {
    const names = Array.from({ length: RECEIVED_IMAGE_LIMIT + 2 }, (_, at) => `${String(at)}.png`);
    const references = receivedImages(chat([toolCallMessage('a1', [done('c1', names)])])).map(
      (image) => image.reference,
    );
    expect(references).toHaveLength(RECEIVED_IMAGE_LIMIT);
    expect(references[0]).toBe('output/2.png');
  });
});

describe('完了を待つ呼び出しの一覧', () => {
  it('どの候補のものも拾い、控えた出力ノード（無ければ空）を添える', () => {
    const queued = { kind: 'queued', promptId: 'p1', outputs: ['9'] } as const;
    const message = toolCallMessage('a1', [call('c1', queued), call('c2', { kind: 'declined' })]);
    const listed = queuedToolCalls(chat([message]));
    expect(listed).toEqual([{ messageId: 'a1', callId: 'c1', promptId: 'p1', outputs: ['9'] }]);
  });

  it('控えた出力ノードを読み戻し、無ければ空として読む', () => {
    const read = (state: unknown) =>
      parseCandidate({
        content: '',
        end: { kind: 'done', reason: null },
        toolCalls: [{ ...call('c1', { kind: 'declined' }), state }],
      })?.toolCalls?.[0]?.state;
    expect(read({ kind: 'queued', promptId: 'p1', outputs: ['9', 3] })).toEqual({
      kind: 'queued',
      promptId: 'p1',
      outputs: ['9'],
    });
    expect(read({ kind: 'queued', promptId: 'p1' })).toEqual({ kind: 'queued', promptId: 'p1' });
  });
});

describe('引数の確かめ', () => {
  const args = [
    { nodeId: '3', input: 'text', name: 'prompt', schema: { type: 'string' } },
    {
      nodeId: '3',
      input: 'steps',
      name: 'steps',
      schema: { type: 'integer', minimum: 1, maximum: 50 },
    },
    { nodeId: '3', input: 'sampler', name: 'sampler', schema: { type: 'string', enum: ['euler'] } },
  ];

  it('合えば extra.kisara.values と同じ形の値を返す', () => {
    const parsed = parseToolArguments(args, '{"prompt":"cat","steps":20,"sampler":"euler"}');
    expect(parsed.ok && parsed.values.get('3')).toEqual({
      text: 'cat',
      steps: 20,
      sampler: 'euler',
    });
  });

  it.each([
    ['{', { code: 'json' }],
    ['[]', { code: 'json' }],
    ['{"prompt":"a","steps":2}', { code: 'missing', argument: 'sampler' }],
    ['{"prompt":"a","steps":2,"sampler":"euler","x":1}', { code: 'unknown', argument: 'x' }],
    ['{"prompt":1,"steps":2,"sampler":"euler"}', { code: 'type', argument: 'prompt' }],
    ['{"prompt":"a","steps":2.5,"sampler":"euler"}', { code: 'type', argument: 'steps' }],
    ['{"prompt":"a","steps":99,"sampler":"euler"}', { code: 'range', argument: 'steps' }],
    ['{"prompt":"a","steps":2,"sampler":"lms"}', { code: 'choice', argument: 'sampler' }],
  ])('%s は合わない', (raw, problem) => {
    expect(parseToolArguments(args, raw)).toEqual({ ok: false, problem });
  });

  it('引数が無ければ空の本文を空の物として受ける', () => {
    expect(parseToolArguments([], '  ')).toEqual({ ok: true, values: new Map() });
  });
});
