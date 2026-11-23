// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PromptAdvisor } from '@/components/llm/advisor/PromptAdvisorPanel';
import { PlaybookStartButton } from '@/components/llm/playbook/PlaybookPanel';
import { playbookRows, usePlaybookManage } from '@/components/llm/playbook/use-playbook-manage';
import { t, tPath } from '@/i18n';
import { memoryTable } from '@/store/persist/chat-repo';
import { useChatStore } from '@/store/use-chat-store';
import { usePlaybookPanelStore } from '@/store/use-playbook-panel-store';
import { installPlaybookTable, usePlaybooksStore } from '@/store/use-playbooks-store';
import { usePromptAdvisorStore } from '@/store/use-prompt-advisor-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { chat } from '../helpers/llm';

afterEach(cleanup);

beforeEach(() => {
  installPlaybookTable(memoryTable());
  usePlaybooksStore.setState({ playbooks: {}, loaded: true });
  useChatStore.setState({ chats: { c1: chat([]) } });
  usePlaybookPanelStore.setState({ open: {} });
  usePromptAdvisorStore.setState({ sessions: {} });
});

function Screen(): React.ReactElement {
  return (
    <>
      <PlaybookStartButton chatId="c1" />
      <PromptAdvisor chatId="c1" side="right" />
    </>
  );
}

const storyName = (): string => tPath('llm.playbook.builtin.story.name');
const editorDialogs = (): HTMLElement[] => screen.queryAllByRole('dialog');

function ManageScreen(): React.ReactElement {
  const manage = usePlaybookManage();
  const rows = playbookRows(usePlaybooksStore((state) => state.playbooks));
  return (
    <>
      {[...rows.builtin, ...rows.mine].map((row) => (
        <div key={row.key}>{manage.menu(row, '')}</div>
      ))}
      {manage.dialogs}
    </>
  );
}

function openCopyOfStory(): void {
  fireEvent.click(
    screen.getByRole('button', { name: t('llm.playbook.menu', { name: storyName() }) }),
  );
  fireEvent.click(screen.getByRole('menuitem', { name: t('llm.playbook.copy') }));
}

describe('選ぶ所', () => {
  it('自分のプレイブックはまだ作らないので、「自分のもの」の組と行のメニューを出さない', () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole('button', { name: t('llm.playbook.start') }));
    expect(screen.getByText(t('llm.playbook.builtinGroup'))).toBeTruthy();
    expect(screen.queryByText(t('llm.playbook.ownGroup'))).toBeNull();
    expect(
      screen.queryByRole('button', { name: t('llm.playbook.menu', { name: storyName() }) }),
    ).toBeNull();
  });
});

describe('自分のプレイブック（作る・直すダイアログ）', () => {
  it('標準を写して作ると、自分のプレイブックとして残す', async () => {
    render(<ManageScreen />);
    openCopyOfStory();
    const name = await screen.findByRole('textbox', { name: t('llm.playbook.editor.name') });
    fireEvent.change(name, { target: { value: 'Mine' } });
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    const own = Object.values(usePlaybooksStore.getState().playbooks);
    expect(own.map((item) => item.playbook.name)).toEqual(['Mine']);
  });

  it('写して作ると、直前の応答を校正の入力欄に入れる印も写す', async () => {
    render(<ManageScreen />);
    openCopyOfStory();
    fireEvent.change(await screen.findByRole('textbox', { name: t('llm.playbook.editor.name') }), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    const [own] = Object.values(usePlaybooksStore.getState().playbooks);
    const actions = own?.playbook.phases.flatMap((phase) => phase.actions) ?? [];
    expect(
      actions.filter((action) => action.kind === 'send' && action.revise === true),
    ).toHaveLength(1);
  });

  it('フェーズを足して名前を付けるまで保存できない', async () => {
    render(<ManageScreen />);
    openCopyOfStory();
    fireEvent.click(await screen.findByRole('button', { name: t('llm.playbook.editor.addPhase') }));
    const save = screen.getByRole('button', { name: t('common.save') });
    expect(save).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox', { name: t('llm.playbook.editor.phaseName') }), {
      target: { value: 'Extra' },
    });
    expect(save).toHaveProperty('disabled', false);
  });

  it('作るダイアログを開いて閉じてもダイアログが残らない', async () => {
    const leak = leakWatch();
    render(<ManageScreen />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(
        screen.getByRole('button', { name: t('llm.playbook.menu', { name: storyName() }) }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: t('llm.playbook.copy') }));
      const dialog = (await screen.findAllByRole('dialog'))[0]!;
      leak.watch(dialog);
      fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }));
      fireEvent.click(await screen.findByRole('button', { name: t('common.ok') }));
      await waitFor(() => expect(editorDialogs()).toHaveLength(0));
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
