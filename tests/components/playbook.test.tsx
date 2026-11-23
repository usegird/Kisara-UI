// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CHARACTER } from '@/chat/card';
import { commentsOf, stripComments } from '@/chat/macros';
import { BUILTIN_PLAYBOOKS, resolvePlaybook } from '@/chat/playbook';
import {
  outlineSteps,
  PLAYBOOK_BOOK,
  startPlaybook,
  withAllSteps,
  withStep,
} from '@/chat/playbook-outline';
import { directionOf, directionText } from '@/chat/playbook-text';
import { PromptAdvisor } from '@/components/llm/advisor/PromptAdvisorPanel';
import { ChatMessageItem } from '@/components/llm/message/ChatMessageItem';
import { PlaybookStartButton } from '@/components/llm/playbook/PlaybookPanel';
import { PlaybookSettingsCard } from '@/components/llm/playbook/PlaybookSettingsCard';
import { t, tPath } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { usePlaybooksStore } from '@/store/use-playbooks-store';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import {
  chat,
  chatMessage,
  outlineBook,
  ownPlaybooks,
  playbookRef,
  TEST_PLAYBOOK_ID,
} from '../helpers/llm';

afterEach(cleanup);

beforeEach(() => {
  useChatStore.setState({ chats: { c1: chat([]) }, drafts: {}, draftDirections: {} });
  usePlaybooksStore.setState({ playbooks: {} });
  usePlaybookPanelStore.setState({ open: {} });
  usePromptAdvisorStore.setState({ sessions: {} });
  useLlmConnectDialogStore.setState({ requested: false, dismissed: false });
  useSettingsStore.setState({ playbooksOn: true, playbooksHidden: [], playbookCardFolded: false });
});

function Screen(): React.ReactElement {
  return (
    <>
      <PlaybookStartButton chatId="c1" />
      <PromptAdvisor chatId="c1" side="right" />
    </>
  );
}

const story = (part: string): string => tPath(`llm.playbook.builtin.story.${part}`);
const shared = (id: string): string => tPath(`llm.playbook.shared.${id}.name`);

function openCommands(): void {
  fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.commands') }));
}
const chooser = (): HTMLElement[] =>
  screen.queryAllByRole('region', { name: t('llm.playbook.title') });

const chooserRow = (id: string): RegExp => {
  const part = (key: string): string => tPath(`llm.playbook.builtin.${id}.${key}`);
  return new RegExp(`^${part('name')}(${t('llm.playbook.chosen')})?${part('description')}$`, 'u');
};

function chooseStory(): void {
  fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
  fireEvent.click(screen.getByRole('button', { name: chooserRow('story') }));
}

function setResponse(id: string, phase: string, action: string, text: string): void {
  const shape = BUILTIN_PLAYBOOKS.find((item) => item.id === id)!;
  const patch = startPlaybook({}, resolvePlaybook(shape, tPath));
  const asked = {
    ...chatMessage('u1', 'user', ['q']),
    instruction: { name: action, content: '', action, direction: true as const },
  };
  const messages = [asked, chatMessage('a1', 'assistant', [text])];
  useChatStore.setState({
    chats: { c1: { ...chat([]), messages, ...patch, playbook: { ...patch.playbook, phase } } },
  });
}

function putSteps(titles: readonly string[], enabled: number | null = null): void {
  act(() => {
    const current = useChatStore.getState().chats.c1!;
    const others = (current.lorebooks ?? []).filter((item) => item.name !== PLAYBOOK_BOOK);
    useChatStore.setState({
      chats: { c1: { ...current, lorebooks: [outlineBook(titles, enabled), ...others] } },
    });
  });
}

const enabledSteps = (): boolean[] =>
  outlineSteps(useChatStore.getState().chats.c1!).map((entry) => entry.enabled);

describe('プレイブックのカード', () => {
  it('始めるアイコンで選ぶ所のカードを開き、× で閉じるとカードも外す', () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
    expect(chooser()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.close') }));
    expect(chooser()).toHaveLength(0);
    expect(screen.queryByRole('region', { name: story('name') })).toBeNull();
  });

  it('選ぶと参照と先頭のフェーズだけを持ち、空の ##playbook を足し、主の操作で段を書かせる相談を開く', () => {
    render(<Screen />);
    chooseStory();
    const current = useChatStore.getState().chats.c1;
    expect(current?.playbook).toEqual({ origin: 'builtin', id: 'story', phase: 'writing' });
    expect(current?.lorebooks?.map((book) => book.name)).toEqual([PLAYBOOK_BOOK]);
    expect(chooser()).toHaveLength(0);
    const consult = screen.getByRole('button', { name: story('actions.makePlan.name') });
    expect(consult.getAttribute('title')).toBe(t('llm.playbook.subSession'));
    fireEvent.click(consult);
    const [session] = Object.values(usePromptAdvisorStore.getState().sessions);
    expect(session?.guide?.guide).toBe(story('actions.makePlan.instruction'));
    expect(session?.guide?.outline).toBe(current?.lorebooks?.[0]?.name);
  });

  it('プロットを相談は、前に開いた相談が残っていれば送った後でも開き直し、× で終えたら新しく始める', () => {
    render(<Screen />);
    chooseStory();
    const consult = (): void => {
      fireEvent.click(screen.getByRole('button', { name: story('actions.makePlan.name') }));
    };
    consult();
    const [first] = Object.keys(usePromptAdvisorStore.getState().sessions);
    act(() => {
      usePromptAdvisorStore.setState((state) => ({
        sessions: {
          [first!]: {
            ...state.sessions[first!]!,
            isOpen: false,
            messages: [{ id: 'u1', role: 'user', content: 'Mystery' }],
          },
        },
      }));
    });
    consult();
    expect(Object.keys(usePromptAdvisorStore.getState().sessions)).toEqual([first]);
    expect(usePromptAdvisorStore.getState().sessions[first!]?.isOpen).toBe(true);
    act(() => usePromptAdvisorStore.getState().end(first!));
    consult();
    const [next] = Object.keys(usePromptAdvisorStore.getState().sessions);
    expect(next).toBeDefined();
    expect(next).not.toBe(first);
  });

  it('プロット進行は 1 つのフェーズで、相談で書いた段をアウトラインの一覧で選ぶ', () => {
    render(<Screen />);
    chooseStory();
    putSteps(['One', 'Two', 'Three']);
    expect(enabledSteps()).toEqual([false, false, false]);
    expect(screen.queryByRole('button', { name: t('llm.playbook.phaseNext') })).toBeNull();
    const name = story('phases.writing.name');
    expect(screen.queryByText(new RegExp(`^${name} \\d+/\\d+$`))).toBeNull();
    const outline = screen.getByRole('group', { name: t('llm.playbook.outline') });
    expect(within(outline).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(
      screen.getByRole('button', { name: t('llm.playbook.makeCurrent', { title: 'Three' }) }),
    );
    expect(enabledSteps()).toEqual([false, false, true]);
  });

  it('候補を受け取ると操作の代わりに候補の行を出し、送る先が無ければ続きを書くの指示と候補を指示の枠に入れる。やめると畳む', () => {
    setResponse('roleplay', 'scene', 'moveIdeas', '1. Dawn: a start\n2. Night: an end');
    render(<Screen />);
    fireEvent.click(
      screen.getByRole('checkbox', { name: t('llm.playbook.pickOne', { title: 'Night' }) }),
    );
    const name = t('llm.playbook.continueSend');
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.pickAndSend', { name }) }));
    const box = useChatStore.getState().draftDirections.c1?.text ?? '';
    expect(box.startsWith(tPath('llm.playbook.builtin.roleplay.continue'))).toBe(true);
    expect(box).toContain('Night');
    expect(useLlmConnectDialogStore.getState().requested).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.pickCancel') }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('送るの操作は「› コマンド」の中のリンクで、常設の操作は進める段だけに並べる', () => {
    render(<Screen />);
    chooseStory();
    expect(screen.getByRole('button', { name: story('actions.makePlan.name') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: shared('twist') })).toBeNull();
    openCommands();
    const links = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)
      .filter((name) => name !== null);
    expect(links.slice(0, 7)).toEqual([
      t('llm.playbook.continueSend'),
      ...['revise', 'deepen', 'shake', 'shift', 'widen', 'close'].map((id) =>
        story(`actions.${id}.name`),
      ),
    ]);
  });

  it('型のリンクは指示の枠に入れ、終わりに向かうは入れたときの次の段の題を差し込む', () => {
    render(<Screen />);
    chooseStory();
    putSteps(['One', 'Two'], 0);
    const insert = (id: string): string | undefined => {
      openCommands();
      fireEvent.click(screen.getByRole('button', { name: story(`actions.${id}.name`) }));
      return useChatStore.getState().draftDirections.c1?.text;
    };
    expect(insert('shake')).toBe(story('actions.shake.instruction'));
    expect(insert('close')).toBe(story('actions.close.instruction').replace('{{nextStep}}', 'Two'));
    fireEvent.click(
      screen.getByRole('button', { name: t('llm.playbook.makeCurrent', { title: 'Two' }) }),
    );
    expect(insert('close')).toBe(
      story('actions.close.instruction').replace('{{nextStep}}', t('llm.playbook.noNextStep')),
    );
  });

  it('直前の応答を校正は、最後が応答のときだけ押せ、入力欄を指示に置き換え、注記は注記の枠に出す', () => {
    render(<Screen />);
    chooseStory();
    openCommands();
    const revise = (): HTMLElement =>
      screen.getByRole('button', { name: story('actions.revise.name') });
    expect(revise().hasAttribute('disabled')).toBe(true);
    act(() => {
      const current = useChatStore.getState().chats.c1!;
      const messages = [chatMessage('u1', 'user', ['q']), chatMessage('a1', 'assistant', ['Text'])];
      useChatStore.setState({ chats: { c1: { ...current, messages } } });
    });
    useChatStore.getState().setDraft('c1', 'Keep the rain. ');
    useChatStore.getState().fillDirection('c1', ['Go on.'], directionOf(null));
    fireEvent.click(revise());
    const state = useChatStore.getState();
    const instruction = story('actions.revise.instruction');
    expect(state.drafts.c1).toBe(stripComments(instruction));
    expect(state.draftNotes.c1).toBe(commentsOf(instruction).join('\n\n'));
    expect(state.draftNotes.c1?.length).toBeGreaterThan(0);
    expect(state.draftDirections.c1).toBeUndefined();
  });

  it('受け取り中も送るのリンクと続きを書くは押せ、指示の枠に入れる。校正だけは押せない', () => {
    render(<Screen />);
    chooseStory();
    act(() => {
      const current = useChatStore.getState().chats.c1!;
      const receiving = chatMessage('a1', 'assistant', ['Partial']);
      const streaming = {
        ...receiving,
        candidates: [{ content: 'Partial', reasoning: '', end: { kind: 'streaming' as const } }],
      };
      const messages = [chatMessage('u1', 'user', ['q']), streaming];
      useChatStore.setState({ chats: { c1: { ...current, messages } } });
    });
    openCommands();
    const link = (name: string): HTMLElement => screen.getByRole('button', { name });
    expect(link(t('llm.playbook.continueSend')).hasAttribute('disabled')).toBe(false);
    expect(link(story('actions.revise.name')).hasAttribute('disabled')).toBe(true);
    fireEvent.click(link(story('actions.deepen.name')));
    expect(useChatStore.getState().draftDirections.c1?.text).toBe(
      story('actions.deepen.instruction'),
    );
  });

  it('コマンドのリンクを押すと、指示の枠に入れて「› コマンド」を閉じる', () => {
    render(<Screen />);
    chooseStory();
    openCommands();
    fireEvent.click(screen.getByRole('button', { name: story('actions.deepen.name') }));
    expect(useChatStore.getState().draftDirections.c1).toBeDefined();
    expect(screen.queryByRole('button', { name: story('actions.deepen.name') })).toBeNull();
    expect(
      screen
        .getByRole('button', { name: t('llm.playbook.commands') })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('見出しの左の三角で縮めると、見出しと選んでいる段の行（‹ › で移る）だけを出す', () => {
    render(<Screen />);
    chooseStory();
    putSteps(['One', 'Two', 'Three'], 0);
    const foldButton = screen.getByRole('button', { name: t('llm.playbook.fold') });
    expect(foldButton.previousElementSibling?.tagName.toLowerCase()).toBe('svg');
    fireEvent.click(foldButton);
    expect(useSettingsStore.getState().playbookCardFolded).toBe(true);
    expect(screen.queryByRole('button', { name: t('llm.playbook.commands') })).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    const step = (i: string, title: string): HTMLElement =>
      screen.getByText(t('llm.playbook.stepAt', { i, n: '3', title }));
    expect(step('1', 'One')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.stepNext') }));
    expect(enabledSteps()).toEqual([false, true, false]);
    expect(step('2', 'Two')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.stepPrev') }));
    expect(enabledSteps()).toEqual([true, false, false]);
    act(() => useChatStore.getState().updatePlaybookChat('c1', withAllSteps));
    expect(screen.getByText(t('llm.playbook.picked', { i: '3', n: '3' }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('llm.playbook.stepNext') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.unfold') }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('× は確かめずに外し、もう一度選ぶと ##playbook（段）を引き継いで最初の段から始める', () => {
    render(<Screen />);
    chooseStory();
    putSteps(['One', 'Two']);
    act(() => useChatStore.getState().updatePlaybookChat('c1', (current) => withStep(current, 1)));
    fireEvent.click(
      screen.getByRole('button', { name: t('llm.playbook.removeNamed', { name: story('name') }) }),
    );
    expect(useChatStore.getState().chats.c1?.playbook).toBeUndefined();
    expect(enabledSteps()).toEqual([false, false]);
    expect(screen.queryByRole('region', { name: story('name') })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
    fireEvent.click(screen.getByRole('button', { name: chooserRow('story') }));
    const current = useChatStore.getState().chats.c1;
    expect(current?.playbook?.id).toBe('story');
    expect(current?.lorebooks).toHaveLength(1);
    expect(enabledSteps()).toEqual([true, false]);
  });

  it('いくつでも選べるフェーズに入ると全部にチェックを入れ、いくつでも切り替えられる', () => {
    const own = ownPlaybooks();
    const item = own[TEST_PLAYBOOK_ID]!;
    const close = {
      id: 'fin',
      name: 'Fin',
      kind: 'close' as const,
      outline: 'multi' as const,
      goal: '',
      actions: [{ kind: 'send' as const, id: 'chk', name: 'Check', instruction: 'Check.' }],
    };
    const phases = [...item.playbook.phases, close];
    usePlaybooksStore.setState({
      playbooks: { [TEST_PLAYBOOK_ID]: { ...item, playbook: { ...item.playbook, phases } } },
    });
    useChatStore.setState({
      chats: {
        c1: {
          ...chat([]),
          playbook: playbookRef('write'),
          lorebooks: [outlineBook(['One', 'Two'], 0)],
        },
      },
    });
    render(<Screen />);
    expect(screen.getByText('Write 2/3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.phaseNext') }));
    expect(enabledSteps()).toEqual([true, true]);
    const two = screen.getByRole('checkbox', {
      name: t('llm.playbook.pickStep', { title: 'Two' }),
    });
    fireEvent.click(two);
    expect(enabledSteps()).toEqual([true, false]);
    openCommands();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(enabledSteps()).toEqual([true, false]);
    fireEvent.click(two);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.phasePrev') }));
    expect(enabledSteps()).toEqual([true, false]);
  });

  it('読むだけのフェーズでも、有効な段をチェックで見せる（押せない）', () => {
    const own = ownPlaybooks();
    const item = own[TEST_PLAYBOOK_ID]!;
    const phases = item.playbook.phases.map((phase) =>
      phase.id === 'write' ? { ...phase, outline: 'readonly' as const } : phase,
    );
    usePlaybooksStore.setState({
      playbooks: { [TEST_PLAYBOOK_ID]: { ...item, playbook: { ...item.playbook, phases } } },
    });
    const book = outlineBook(['One', 'Two'], null);
    const all = { ...book, entries: book.entries.map((entry) => ({ ...entry, enabled: true })) };
    useChatStore.setState({
      chats: { c1: { ...chat([]), playbook: playbookRef('write'), lorebooks: [all] } },
    });
    render(<Screen />);
    const boxes = screen.getAllByRole('checkbox');
    const states = boxes.map((box) => [
      (box as HTMLInputElement).checked,
      box.hasAttribute('disabled'),
    ]);
    expect(states).toEqual([
      [true, true],
      [true, true],
    ]);
  });

  it('選ぶ所を開いて閉じても残らない', async () => {
    const leak = leakWatch();
    render(<Screen />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
      leak.watch(chooser()[0]!);
      fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.close') }));
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('続きを書く・指示の枠', () => {
  it('「続きを書く」は押すと送らずに指示を指示の枠に入れ、入力欄は空にする', () => {
    render(<Screen />);
    chooseStory();
    const continueButton = (): HTMLElement | null =>
      screen.queryByRole('button', { name: t('llm.playbook.continueSend') });
    const sendDirection = vi
      .spyOn(useChatStore.getState(), 'sendDirection')
      .mockImplementation(vi.fn());
    useChatStore.getState().setDraft('c1', 'More rain.');
    openCommands();
    fireEvent.click(continueButton()!);
    expect(sendDirection).not.toHaveBeenCalled();
    expect(useChatStore.getState().drafts.c1).toBe('');
    expect(useChatStore.getState().draftDirections.c1).toEqual({
      instruction: directionOf(null),
      text: story('continue'),
    });
    sendDirection.mockRestore();
  });

  it('送る操作は指示を指示の枠に入れ、送ると枠と打ちかけを囲んでその操作として送る', () => {
    render(<Screen />);
    chooseStory();
    openCommands();
    fireEvent.click(screen.getByRole('button', { name: story('actions.shift.name') }));
    const box = useChatStore.getState().draftDirections.c1;
    expect(box?.text).toBe(story('actions.shift.instruction'));
    expect(box?.instruction.action).toBe('shift');
    const sendDirection = vi
      .spyOn(useChatStore.getState(), 'sendDirection')
      .mockImplementation(vi.fn());
    useChatStore.getState().setDirectionText('c1', 'Check it.');
    useChatStore.getState().send('c1');
    expect(sendDirection).toHaveBeenCalledWith('c1', ['Check it.'], box?.instruction);
    sendDirection.mockRestore();
    act(() => useChatStore.getState().clearDirection('c1'));
    expect(useChatStore.getState().draftDirections.c1).toBeUndefined();
  });

  it('機能のタブで切ると始めるアイコンを出さず、外したものは選ぶ所に出さない', () => {
    useSettingsStore.setState({ playbooksOn: false });
    const { unmount } = render(<Screen />);
    expect(screen.queryByRole('button', { name: t('llm.playbook.start') })).toBeNull();
    unmount();
    useSettingsStore.setState({ playbooksOn: true });
    render(
      <>
        <Screen />
        <PlaybookSettingsCard />
      </>,
    );
    const name = story('name');
    const card = screen.getByRole('region', { name: t('llm.extension.playbook.title') });
    expect(within(card).queryByText(t('llm.playbook.builtinGroup'))).toBeNull();
    expect(within(card).queryByText(t('llm.playbook.ownGroup'))).toBeNull();
    expect(
      within(card).queryByRole('button', { name: t('llm.playbook.menu', { name }) }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('checkbox', { name: t('llm.extension.playbook.show', { name }) }),
    );
    expect(useSettingsStore.getState().playbooksHidden).toEqual(['builtin:story']);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
    expect(screen.queryByRole('button', { name: chooserRow('story') })).toBeNull();
    expect(screen.queryByRole('button', { name: chooserRow('research') })).toBeNull();
  });
});

describe('ログの指示の印', () => {
  it('指示の発言は吹き出しにせず「指示」の開閉の行にし、開くと囲みを含む本文を出す', () => {
    const text = directionText(['Write on.']);
    const message = {
      ...chatMessage('u1', 'user', [text]),
      instruction: { name: 'Write it', content: '', action: 'w', direction: true as const },
    };
    useChatStore.setState({ chats: { c1: chat([message]) } });
    render(
      <ChatMessageItem
        chatId="c1"
        messageId="u1"
        last={false}
        canGenerate
        canRollback
        onRollback={() => {}}
        onFork={() => {}}
      />,
    );
    const summary = screen.getByText(t('llm.playbook.directionMark'));
    expect(screen.queryByText('Write it')).toBeNull();
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(details?.textContent).toContain('<direction>');
    expect(details?.textContent).toContain('Write on.');
  });

  it('応答の本文は戻すの行の左の文字を値に戻して出し、コピーも直す欄も持つ本文のまま扱う', () => {
    const reply = chatMessage('a1', 'assistant', ['アオバネが笑う']);
    const character = {
      ...EMPTY_CHARACTER,
      name: 'Aoi',
      variables: [{ id: 'v', name: 'アオバネ', value: '花子', restore: true as const }],
    };
    useChatStore.setState({ chats: { c1: chat([reply], { character }) } });
    render(
      <ChatMessageItem
        chatId="c1"
        messageId="a1"
        last={false}
        canGenerate
        canRollback
        onRollback={() => {}}
        onFork={() => {}}
      />,
    );
    expect(screen.getByText('花子が笑う')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('llm.chat.edit') }));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('アオバネが笑う');
  });

  it('開いた本文は、送るときと同じく {{char}}・{{user}} を置き換えて出す', () => {
    const text = directionText(['{{char}} greets {{user}}.']);
    const message = {
      ...chatMessage('u1', 'user', [text]),
      instruction: { name: '', content: '', direction: true as const },
    };
    const character = { ...EMPTY_CHARACTER, name: 'Aoi' };
    const persona = { name: 'Kei', description: '' };
    useChatStore.setState({ chats: { c1: chat([message], { character, persona }) } });
    render(
      <ChatMessageItem
        chatId="c1"
        messageId="u1"
        last={false}
        canGenerate
        canRollback
        onRollback={() => {}}
        onFork={() => {}}
      />,
    );
    const details = screen.getByText(t('llm.playbook.directionMark')).closest('details');
    expect(details?.textContent).toContain('Aoi greets Kei.');
    const stored = useChatStore.getState().chats.c1?.messages[0]?.candidates[0]?.content;
    expect(stored).toContain('{{char}}');
  });
});
