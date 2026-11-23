// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { installLlmPort } from '@/store/ports/llm-port';
import { provideChatTools, useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { callRequestKey, useSentRequestsStore } from '@/store/use-sent-requests-store';

import {
  chat,
  chatMessage,
  fakeLlmPort,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

let port: FakeLlmPort;

const definition = (name: string) => ({
  type: 'function' as const,
  function: { name, description: '', parameters: { type: 'object', properties: {} } },
});

beforeEach(() => {
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile()] });
  provideChatTools({
    definitions: () => [definition('make_image'), definition('upscale')],
    check: () => ({ kind: 'waiting' }),
  });
  const messages = [
    chatMessage('u1', 'user', ['draw a cat']),
    chatMessage('a1', 'assistant', ['ok']),
    chatMessage('u2', 'user', ['later']),
  ];
  useChatStore.setState({ chats: { c1: chat(messages) }, places: {}, saveStates: {} });
  setDefaultLlm();
});

describe('呼び出しを作らせる', () => {
  it('その発言までを送り、選んだ 1 件だけを tool_choice で呼ばせ、返った呼び出しを足す', async () => {
    const pending = useChatStore.getState().requestToolCall('c1', 'a1', 'upscale');
    const request = port.requests[0];
    expect(request?.tool_choice).toEqual({ type: 'function', function: { name: 'upscale' } });
    expect(request?.tools?.length).toBe(1);
    expect(request?.messages.map((message) => message.content)).toEqual(['draw a cat', 'ok']);

    port.emit({ kind: 'tool-call', index: 0, id: 'x', name: 'upscale', arguments: '{}' });
    port.finish();
    const result = await pending;
    const calls = useChatStore.getState().chats.c1?.messages[1]?.candidates[0]?.toolCalls;
    expect(calls?.map((call) => [call.name, call.state.kind])).toEqual([['upscale', 'waiting']]);
    expect(result.ok && result.callIds).toEqual([calls?.[0]?.id]);
  });

  it('作らせた応答の思考・トークン数・受け取りの記録を、返った呼び出しに持たせる', async () => {
    const pending = useChatStore.getState().requestToolCall('c1', 'a1', 'upscale');
    port.emit({ kind: 'delta', content: '', reasoning: 'think ' });
    port.emit({ kind: 'delta', content: '', reasoning: 'more' });
    port.emit({ kind: 'tool-call', index: 0, id: 'x', name: 'upscale', arguments: '{}' });
    port.emit({ kind: 'usage', usage: { prompt: 120, completion: 30 } });
    port.finish();
    await pending;
    const call = useChatStore.getState().chats.c1?.messages[1]?.candidates[0]?.toolCalls?.[0];
    expect(call?.generation?.reasoning).toBe('think more');
    expect(call?.generation?.usage).toEqual({ prompt: 120, completion: 30 });
    expect(call?.generation?.timing?.firstMs).toBeTypeOf('number');
  });

  it('作らせたときに送った本文を、返った呼び出しの鍵で記録する。返らなければ失敗の記録の鍵で残す', async () => {
    useSentRequestsStore.setState({ byKey: {} });
    const pending = useChatStore.getState().requestToolCall('c1', 'a1', 'upscale');
    port.emit({ kind: 'tool-call', index: 0, id: 'x', name: 'upscale', arguments: '{}' });
    port.finish();
    const result = await pending;
    const callId = result.ok ? result.callIds[0] : undefined;
    const { byKey } = useSentRequestsStore.getState();
    expect(Object.keys(byKey)).toEqual([callRequestKey('c1', callId ?? '')]);
    expect(Object.values(byKey)[0]?.body).toBe(JSON.stringify(port.requests[0]));

    const empty = useChatStore.getState().requestToolCall('c1', 'a1', 'make_image');
    port.finish();
    const failed = await empty;
    const attemptId = failed.ok ? '' : (failed.attempt?.id ?? '');
    expect(Object.keys(useSentRequestsStore.getState().byKey)).toContain(
      callRequestKey('c1', attemptId),
    );
  });

  it('呼び出しが返らなければ失敗にして何も足さず、作らせた応答の記録と書いた本文を返す', async () => {
    const pending = useChatStore.getState().requestToolCall('c1', 'a1', 'make_image');
    port.emit({ kind: 'delta', content: 'I cannot', reasoning: 'hmm' });
    port.emit({ kind: 'usage', usage: { prompt: 80, completion: 5 } });
    port.finish();
    const result = await pending;
    expect(!result.ok && result.failure.kind).toBe('bad-response');
    expect(useChatStore.getState().chats.c1?.messages[1]?.candidates[0]?.toolCalls).toBeUndefined();
    const attempt = result.ok ? undefined : result.attempt;
    expect(attempt?.text).toBe('I cannot');
    expect(attempt?.generation.usage).toEqual({ prompt: 80, completion: 5 });
    expect(attempt?.generation.reasoning).toBe('hmm');
  });
});
