// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PromptItem } from '@/chat/types';
import { itemLabel } from '@/components/llm/prompt/prompt-text';
import { PromptItemList } from '@/components/llm/prompt/PromptItemList';
import { t } from '@/i18n';
import { useChatStore } from '@/store/use-chat-store';

import { chat, sampleComposition } from '../helpers/llm';

afterEach(() => {
  cleanup();
  useChatStore.setState({ chats: {} });
});

const items = sampleComposition().items.slice(0, 1);

function renderList(composition = sampleComposition()): void {
  render(
    <PromptItemList
      chatId="c1"
      composition={composition}
      tokens={new Map()}
      prefillTokens={undefined}
      summary={() => ({ text: '', empty: true, source: '', note: '', lore: [], card: null })}
      onAdd={() => {}}
      open={new Set()}
      onToggle={() => {}}
      onRemove={() => {}}
      naming={null}
      onNamed={() => {}}
      sessionSummary={{ count: 0, tokens: undefined }}
    />,
  );
}

describe('PromptItemList の読み上げ', () => {
  it('操作の説明と取っ手の役割を画面の言語で渡す', () => {
    renderList();
    const handle = screen.getByRole('button', {
      name: t('llm.prompt.reorder', { name: itemLabel(items[0]!) }),
    });
    const described = document.getElementById(handle.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(t('ui.drag.instructions'));
    expect(handle.getAttribute('aria-roledescription')).toBe(t('ui.drag.sortable'));
  });

  it('キーボードで掴むと、id ではなく名前で知らせる', async () => {
    renderList();
    const first = items[0]!;
    const handle = screen.getByRole('button', {
      name: t('llm.prompt.reorder', { name: itemLabel(first) }),
    });
    handle.focus();
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
    const live = screen.getByRole('status');
    expect(live.textContent).toBe(t('ui.drag.start', { name: itemLabel(first) }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.keyDown(handle, { code: 'ArrowDown', key: 'ArrowDown' });
    expect(live.textContent).not.toContain(first.id);
    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
    expect(live.textContent).toBe(t('ui.drag.cancel', { name: itemLabel(first) }));
  });
});

describe('PromptItemList の動かせない行と無効', () => {
  it('動かせない行に地を付け、間に入れられない会話履歴とメッセージはつなげる', () => {
    renderList();
    const row = (name: string): HTMLElement =>
      screen.getByRole('button', { name: new RegExp(name) }).closest('li')!;
    const history = row(t('llm.prompt.items.chatHistory'));
    expect(history.className).toContain('bg-band/50');
    expect(history.className).toContain('rounded-b-none');
    expect(row(t('llm.prompt.prefill')).className).not.toContain('-mt-1');
    expect(screen.getAllByRole('listitem')[0]!.className).not.toContain('bg-band');
  });

  it('無効にするアイコンで項目を無効にし、名前に取り消し線を引く。もう一度押すと戻す', () => {
    useChatStore.setState({ chats: { c1: chat() } });
    const first = sampleComposition().items[0]!;
    const name = itemLabel(first);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: t('llm.prompt.disable', { name }) }));
    const disabled = useChatStore.getState().chats['c1']!.prompt;
    expect(disabled.items[0]!.enabled).toBe(false);

    cleanup();
    renderList(disabled);
    expect(screen.getByText(name).className).toContain('line-through');
    fireEvent.click(screen.getByRole('button', { name: t('llm.prompt.enable', { name }) }));
    expect(useChatStore.getState().chats['c1']!.prompt.items[0]!.enabled).toBe(true);
  });
});

describe('PromptItemList の深さの項目と tools の行', () => {
  const depthItem = (name: string, depth: number): PromptItem => ({
    id: name,
    name,
    role: 'system',
    marker: null,
    content: `${name} body`,
    enabled: true,
    position: { kind: 'depth', depth, order: 100 },
  });

  it('送る順に、深さ 1 以上は会話履歴の下、深さ 0 はメッセージの下に出し、tools はプレフィルの下', () => {
    const base = sampleComposition();
    const items = [...base.items, depthItem('Zero', 0), depthItem('Deep', 2)];
    render(
      <PromptItemList
        chatId="c1"
        composition={{ ...base, items }}
        tokens={new Map()}
        prefillTokens={undefined}
        summary={() => ({ text: '', empty: true, source: '', note: '', lore: [], card: null })}
        onAdd={() => {}}
        open={new Set()}
        onToggle={() => {}}
        onRemove={() => {}}
        naming={null}
        onNamed={() => {}}
        sessionSummary={{ count: 0, tokens: undefined }}
        tools={<div>TOOLS-ROW</div>}
      />,
    );
    const text = document.body.textContent ?? '';
    const at = (part: string): number => text.indexOf(part);
    expect(at(t('llm.prompt.items.chatHistory'))).toBeLessThan(at('Deep'));
    expect(at('Deep')).toBeLessThan(at(t('llm.prompt.items.currentInput')));
    expect(at(t('llm.prompt.items.currentInput'))).toBeLessThan(at('Zero'));
    expect(at(t('llm.prompt.prefill'))).toBeLessThan(at('TOOLS-ROW'));
  });
});
