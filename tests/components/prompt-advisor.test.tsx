// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdvisorMessage } from '@/chat/prompt-advisor';
import { advisorRecordTargetOf } from '@/chat/prompt-advisor-tool';
import {
  PromptAdvisor,
  PromptAdvisorStartButton,
} from '@/components/llm/advisor/PromptAdvisorPanel';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import {
  formatGreeting,
  greetingUse,
  usePromptAdvisorStore,
} from '@/store/use-prompt-advisor-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat, profile, setDefaultLlm } from '../helpers/llm';

const renders = vi.hoisted(() => ({ messages: new Map<string, number>(), composer: 0 }));

vi.mock('@/components/llm/advisor/PromptAdvisorMessage', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/components/llm/advisor/PromptAdvisorMessage')>();
  return {
    ...original,
    PromptAdvisorMessage: (props: Parameters<typeof original.PromptAdvisorMessage>[0]) => {
      const id = props.message.id;
      renders.messages.set(id, (renders.messages.get(id) ?? 0) + 1);
      return original.PromptAdvisorMessage(props);
    },
  };
});

vi.mock('@/components/llm/workspace/WebSearchToggle', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/components/llm/workspace/WebSearchToggle')>();
  return {
    ...original,
    WebSearchToggle: (props: Parameters<typeof original.WebSearchToggle>[0]) => {
      renders.composer += 1;
      return original.WebSearchToggle(props);
    },
  };
});

afterEach(cleanup);

beforeEach(() => {
  useChatStore.setState({ chats: { c1: chat([]) } });
  useSettingsStore.setState({ llmSystemPrompt: 'SYS-PROMPT' });
  usePromptAdvisorStore.setState({ sessions: {} });
});

function Screen(): React.ReactElement {
  return (
    <>
      <PromptAdvisorStartButton chatId="c1" />
      <PromptAdvisor chatId="c1" side="right" />
    </>
  );
}

const startButton = (): HTMLElement => screen.getByRole('button', { name: 'LLM と構成を相談する' });
const panels = (): HTMLElement[] => screen.queryAllByRole('complementary', { name: '構成の相談' });

describe('構成の相談', () => {
  it('初期メッセージの候補を ‹ › で切り替え、送る付加情報を三角で開く', () => {
    render(<Screen />);
    fireEvent.click(startButton());
    expect(screen.getByText(formatGreeting(0).split('\n')[0]!, { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '次の候補' }));
    const [started] = Object.values(usePromptAdvisorStore.getState().sessions);
    expect(started?.greeting).toBe(1);
    expect(screen.getByText(formatGreeting(1).split('\n')[0]!, { exact: false })).toBeTruthy();

    const context = screen.getByRole('button', { name: '送る付加情報' });
    expect(context.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(context);
    expect(screen.getByText(/propose_prompt_changes/u, { selector: 'pre' })).toBeTruthy();
  });

  it('送っていない相談は開き直し、送った相談があれば 2 枚目のカードで新しく始める', () => {
    render(<Screen />);
    fireEvent.click(startButton());
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(panels()).toHaveLength(0);
    fireEvent.click(startButton());
    expect(panels()).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '構成の相談を終える' })).toHaveLength(1);

    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: Object.fromEntries(
          Object.values(state.sessions).map((session) => [
            session.id,
            { ...session, messages: [{ id: 'u1', role: 'user', content: 'Asked' }] },
          ]),
        ),
      }));
    });
    fireEvent.click(startButton());
    expect(screen.getAllByRole('button', { name: '構成の相談を終える' })).toHaveLength(2);
    expect(panels()).toHaveLength(1);
    expect(within(panels()[0]!).queryByText('Asked')).toBeNull();
  });

  it('カードには初めに送った発言の頭を出し、受け取り中は印と経過時間を出す', () => {
    vi.useFakeTimers();
    try {
      const id = usePromptAdvisorStore.getState().start('c1');
      act(() => {
        usePromptAdvisorStore.setState((state) => ({
          sessions: {
            [id]: {
              ...state.sessions[id]!,
              streaming: true,
              sentAt: performance.now(),
              messages: [
                { id: 'u1', role: 'user', content: 'First ask\nmore' },
                { id: 'a1', role: 'assistant', content: 'Reply' },
                { id: 'u2', role: 'user', content: 'Second ask' },
                { id: 'a2', role: 'assistant', content: '' },
              ],
            },
          },
        }));
      });
      render(<Screen />);
      expect(screen.getByRole('button', { name: /First ask/ })).toBeTruthy();
      const status = within(panels()[0]!).getByRole('status', { name: '受け取り中…' });
      expect(status.textContent).toBe('0m 00s');
      act(() => {
        vi.advanceTimersByTime(65_000);
      });
      expect(status.textContent).toBe('1m 05s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('モデルを選んでいなければ送るボタンを止め、その旨を出す', () => {
    useSettingsStore.setState({ llmProfileId: null, llmModel: '' });
    const id = usePromptAdvisorStore.getState().start('c1');
    act(() => usePromptAdvisorStore.getState().setDraft(id, 'Hi'));
    render(<Screen />);
    const panel = panels()[0]!;
    expect(within(panel).getByRole('button', { name: '送る' }).hasAttribute('disabled')).toBe(true);
    expect(within(panel).getByText('実行モデルが選択されていません')).toBeTruthy();
  });

  it('LLM の発言に思考の本文・出典・応答の情報を添える', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: {
          [id]: {
            ...state.sessions[id]!,
            messages: [
              {
                id: 'a1',
                role: 'assistant',
                content: 'Body',
                reasoning: 'THINKING',
                citations: [{ url: 'https://a.example/x', title: 'Source A' }],
                billing: { searches: 2 },
                usage: { prompt: 900, completion: 40 },
              },
            ],
          },
        },
      }));
    });
    render(<Screen />);
    const panel = panels()[0]!;
    expect(within(panel).getByText('THINKING')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Source A' })).toBeTruthy();
    const stats = within(panel).getByRole('group', { name: '応答の情報' });
    expect(stats.textContent).toContain('2 回');
    expect(stats.textContent).toContain('900');
  });

  it('案を本文の中のカードに出し、三角で開いて本文を見て、反映すると元に戻すに替わる', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: {
          [id]: {
            ...state.sessions[id]!,
            messages: [
              {
                id: 'a1',
                role: 'assistant',
                content:
                  'Here:\n```kisara-prompt\n' +
                  JSON.stringify({
                    title: 'Plan',
                    changes: [{ target: 'item', id: 'rules', content: 'R' }],
                  }) +
                  '\n```',
              },
            ],
          },
        },
      }));
    });
    render(<Screen />);
    const toggle = screen.getByRole('button', { name: 'Plan' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByText('R', { selector: 'pre' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '反映する' }));
    const rules = useChatStore
      .getState()
      .chats.c1?.prompt.items.find((item) => item.id === 'rules');
    expect(rules?.content).toBe('R');
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(screen.getByRole('button', { name: '反映する' })).toBeTruthy();
  });

  it('ツールの呼び出しの案は本文の下のカードにし、受け取り中は書いている途中、読めなければ読めない旨を出す', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    const args = JSON.stringify({
      title: 'Tool plan',
      changes: [{ target: 'item', id: 'rules', content: 'R' }],
    });
    const seedCalls = (streaming: boolean, calls: readonly [string, string][]): void => {
      act(() => {
        usePromptAdvisorStore.setState((state) => ({
          sessions: {
            [id]: {
              ...state.sessions[id]!,
              streaming,
              messages: [
                {
                  id: 'a1',
                  role: 'assistant',
                  content: 'See below.',
                  toolCalls: calls.map(([callId, raw]) => ({
                    id: callId,
                    name: 'propose_prompt_changes',
                    arguments: raw,
                  })),
                },
              ],
            },
          },
        }));
      });
    };
    seedCalls(true, [['', args]]);
    const { unmount } = render(<Screen />);
    expect(screen.getByText('案を書いています…')).toBeTruthy();
    unmount();

    seedCalls(false, [
      ['call_a1_0', args],
      ['call_a1_1', '{"title"'],
    ]);
    render(<Screen />);
    expect(screen.getByRole('button', { name: 'Tool plan' })).toBeTruthy();
    expect(screen.getByText('案を読めませんでした')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '反映する' }));
    const rules = useChatStore
      .getState()
      .chats.c1?.prompt.items.find((item) => item.id === 'rules');
    expect(rules?.content).toBe('R');
  });

  it('案の無い最後の応答には「決まったことを入れる」を出し、押すと書き先に合わせた定型の発言を送る', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    const seed = (messages: AdvisorMessage[]): void => {
      act(() => {
        usePromptAdvisorStore.setState((state) => ({
          sessions: { [id]: { ...state.sessions[id]!, messages } },
        }));
      });
    };
    const label = t('llm.advisor.record.label');
    seed([
      { id: 'u1', role: 'user', content: 'Pick 2' },
      { id: 'a1', role: 'assistant', content: 'Decided.' },
    ]);
    const send = vi.spyOn(usePromptAdvisorStore.getState(), 'send').mockResolvedValue();
    const { unmount } = render(<Screen />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    const target = advisorRecordTargetOf(greetingUse(0), null);
    expect(send).toHaveBeenCalledWith(id, t(`llm.advisor.record.${target}`));
    unmount();
    const args = JSON.stringify({ title: 'T', changes: [{ target: 'main', content: 'M' }] });
    seed([
      { id: 'a0', role: 'assistant', content: 'Decided.' },
      {
        id: 'a1',
        role: 'assistant',
        content: 'See below.',
        toolCalls: [{ id: 'c', name: 'propose_prompt_changes', arguments: args }],
      },
    ]);
    render(<Screen />);
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    send.mockRestore();
  });
});

describe('構成の相談の上限に近い知らせと要約の行', () => {
  const seed = (patch: Record<string, unknown>): void => {
    const id = usePromptAdvisorStore.getState().start('c1');
    const messages = Array.from({ length: 6 }, (_, at) => ({
      id: `m${String(at)}`,
      role: at % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `text ${String(at)}`,
    }));
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: { [id]: { ...state.sessions[id]!, messages, ...patch } },
      }));
    });
  };
  const usage = (prompt: number) => ({
    messages: [
      ...Array.from({ length: 5 }, (_, at) => ({
        id: `m${String(at)}`,
        role: at % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `text ${String(at)}`,
      })),
      { id: 'm5', role: 'assistant' as const, content: 'last', usage: { prompt, completion: 1 } },
    ],
  });

  beforeEach(() => {
    useLlmProfilesStore.setState({ profiles: [profile()], checks: {}, learned: {} });
    setDefaultLlm();
    useLlmProfilesStore.getState().learnContext('p1', 'model-a', 8000);
  });

  it('最後の発言の使った数が上限の 8 割以上で、縮められる発言があれば知らせと「要約する」を出す', () => {
    seed(usage(4900));
    const { unmount } = render(<Screen />);
    expect(screen.getByText(/返答が途中で切れずに続けられます/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '要約する' })).toBeTruthy();
    unmount();
    usePromptAdvisorStore.setState({ sessions: {} });

    seed(usage(4000));
    render(<Screen />);
    expect(screen.queryByText(/返答が途中で切れずに続けられます/)).toBeNull();
  });

  it('上限を超えて送れなかったときは、2 往復でも上限を超えた旨と「要約する」を出す', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    const messages = ['u0', 'a1', 'u2', 'a3'].map((key, at) => ({
      id: key,
      role: at % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: at === 3 ? '' : key,
    }));
    const failure = { kind: 'rejected', overflow: { context: 8000, prompt: 9000 } } as const;
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: { [id]: { ...state.sessions[id]!, messages, failure } },
      }));
    });
    render(<Screen />);
    expect(screen.getByText(/送れる上限を超えたため/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '要約する' })).toBeTruthy();
  });

  it('要約している間はリンクを「要約しています…」に替え、要約した相談は残した発言の手前に要約の行を出す', () => {
    seed({ ...usage(4900), summarizing: true });
    const { unmount } = render(<Screen />);
    expect(screen.getByRole('button', { name: '要約しています…' })).toBeTruthy();
    unmount();
    usePromptAdvisorStore.setState({ sessions: {} });

    seed({ summary: { content: 'SUMMARY', upTo: 'm1' } });
    const { container } = render(<Screen />);
    const row = [...container.querySelectorAll('details')].find((details) =>
      details.textContent.startsWith('要約'),
    );
    expect(row?.open).toBe(false);
    expect(row?.textContent).toBe('要約SUMMARY');
    const log = within(screen.getByRole('log', { name: '構成の相談' }));
    expect(log.getByText('text 0')).toBeTruthy();
    const next = log.getByText('text 2');
    expect(row!.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('構成の相談の受け取り中の描き直し', () => {
  it('本文が届いても、受け取り中でない発言と入力欄を描き直さない', () => {
    const id = usePromptAdvisorStore.getState().start('c1');
    const setReply = (content: string): void =>
      usePromptAdvisorStore.setState((state) => {
        const session = state.sessions[id]!;
        return {
          sessions: {
            [id]: {
              ...session,
              streaming: true,
              messages: [
                ...session.messages.filter((message) => message.id !== 'a1'),
                { id: 'a1', role: 'assistant', content },
              ],
            },
          },
        };
      });
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: {
          [id]: { ...state.sessions[id]!, messages: [{ id: 'u1', role: 'user', content: 'Q' }] },
        },
      }));
      setReply('');
    });
    render(<Screen />);
    const user = renders.messages.get('u1') ?? 0;
    const reply = renders.messages.get('a1') ?? 0;
    const composer = renders.composer;
    expect(user, '発言が描かれていない').toBeGreaterThan(0);

    for (let index = 1; index <= 20; index += 1) {
      act(() => setReply('x'.repeat(index)));
    }
    expect(renders.messages.get('u1')).toBe(user);
    expect(renders.composer).toBe(composer);
    expect(renders.messages.get('a1')).toBe(reply + 20);
  });
});

describe('構成の相談の漏れ', () => {
  it('始めて終えるのを繰り返しても、終えた欄を残さない', async () => {
    render(<Screen />);
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      act(() => {
        fireEvent.click(startButton());
      });
      leak.watch(screen.getByRole('complementary', { name: '構成の相談' }));
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: '構成の相談を終える' }));
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
