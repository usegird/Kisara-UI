// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StyleEditorOverlay } from '@/components/comfy/dialogs/StyleEditorOverlay';
import { WildcardOverlay } from '@/components/comfy/dialogs/WildcardOverlay';
import { parseStyleTable, type Style } from '@/graph/styles';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

const SAMPLE = '﻿name,prompt,negative_prompt\r\nanima,"1girl, solo",bad hands\r\n';

function seed(): void {
  useConnectionStore.setState({ status: 'connected' });
  useSettingsStore.setState({ baseUrl: 'http://127.0.0.1:8188' });
  useStylesStore.setState({
    status: 'ready',
    table: parseStyleTable(SAMPLE),
    loadedFrom: 'http://127.0.0.1:8188',
    error: null,
    editing: null,
  });
}

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ status: 'disconnected' });
  useSettingsStore.setState({ baseUrl: '' });
});

async function show(): Promise<void> {
  render(<StyleEditorOverlay />);
  await screen.findByLabelText('肯定の文面');
}

describe('編集', () => {
  it('直して保存すると、その内容で書き戻す', async () => {
    seed();
    const save = vi.fn<(baseUrl: string, original: string | null, style: Style) => Promise<null>>(
      () => Promise.resolve(null),
    );
    useStylesStore.setState({ editing: { name: 'anima' }, save });
    await show();

    fireEvent.change(screen.getByLabelText('肯定の文面'), { target: { value: '1girl, smile' } });
    fireEvent.click(screen.getByText('保存'));

    expect(save.mock.calls[0]?.[1]).toBe('anima');
    expect(save.mock.calls[0]?.[2]).toMatchObject({ name: 'anima', prompt: '1girl, smile' });
  });

  it('削除は確かめてから消す', async () => {
    seed();
    const remove = vi.fn<(baseUrl: string, name: string) => Promise<void>>(() => Promise.resolve());
    useStylesStore.setState({ editing: { name: 'anima' }, remove });
    await show();

    fireEvent.click(screen.getByText('削除'));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('削除する'));
    expect(remove.mock.calls[0]?.[1]).toBe('anima');
  });

  it('読み終えていない接続先では保存も削除も押せない', async () => {
    seed();
    useStylesStore.setState({ editing: { name: 'anima' }, loadedFrom: 'http://other' });
    await show();

    expect(screen.getByText('保存').closest('button')).toHaveProperty('disabled', true);
    expect(screen.getByText('削除').closest('button')).toHaveProperty('disabled', true);
  });

  it('外の複数行の入力欄へ差し込み、画面を閉じる', async () => {
    seed();
    const field = document.createElement('textarea');
    field.value = 'head: tail';
    document.body.append(field);
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();

    field.focus();
    field.setSelectionRange(6, 6);
    fireEvent.focusIn(field);

    fireEvent.click(screen.getByLabelText('肯定の文面をキャレット位置に取り込む'));

    expect(field.value).toBe('head: 1girl, solotail');
    expect(field.selectionStart).toBe(17);
    expect(useStylesStore.getState().editing).toBeNull();

    field.remove();
  });

  it('左の列の上部に肯定・否定のボタンと閉じる ×、写し取りは文面の脇', async () => {
    seed();
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();

    const buttons = ['肯定', '否定'].map(
      (name) => screen.getByLabelText(`${name}の文面をキャレット位置に取り込む`).textContent,
    );
    expect(buttons).toEqual(['肯定', '否定']);
    expect(screen.getByLabelText('肯定の文面を写す')).toBeDefined();

    const closes = screen.getAllByRole('button', { name: 'スタイルの編集を閉じる' });
    expect(closes).toHaveLength(2);
    fireEvent.click(closes[1] as HTMLElement);
    expect(useStylesStore.getState().editing).toBeNull();
  });

  it('外から閉じるよう頼まれたら、直しかけが無ければ閉じ、あれば確かめる', async () => {
    seed();
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();

    act(() => useStylesStore.getState().requestCloseEditor());
    expect(useStylesStore.getState().editing).toBeNull();
    act(() => useStylesStore.getState().openEditor('anima'));

    fireEvent.change(screen.getByLabelText('肯定の文面'), { target: { value: '直しかけ' } });
    act(() => useStylesStore.getState().requestCloseEditor());
    expect(await screen.findByText('編集中の内容')).toBeDefined();
    expect(useStylesStore.getState().editing).not.toBeNull();

    fireEvent.click(screen.getByText('OK'));
    expect(useStylesStore.getState().editing).toBeNull();
  });

  it('アプリ入力から送った文面は、肯定に入れた新規として開き、直しかけがあれば確かめる', async () => {
    seed();
    useStylesStore.setState({ newStyleRequest: null });
    act(() => useStylesStore.getState().requestNewStyle('1girl, smile'));
    await show();
    expect(screen.getByLabelText<HTMLTextAreaElement>('肯定の文面').value).toBe('1girl, smile');
    expect(screen.getByLabelText<HTMLInputElement>('名前').value).toBe('');

    act(() => useStylesStore.getState().requestNewStyle('2girls'));
    expect(await screen.findByText('編集中の内容')).toBeDefined();
    fireEvent.click(screen.getByText('キャンセル'));
    expect(screen.getByLabelText<HTMLTextAreaElement>('肯定の文面').value).toBe('1girl, smile');

    act(() => useStylesStore.getState().requestNewStyle('2girls'));
    fireEvent.click(await screen.findByText('OK'));
    expect(screen.getByLabelText<HTMLTextAreaElement>('肯定の文面').value).toBe('2girls');
  });

  it('直しかけのままほかの埋め込みが開いたら確かめ、やめたらスタイルに戻って開いた方を閉じる', async () => {
    seed();
    const host = document.createElement('div');
    document.body.append(host);
    act(() => useDialogStore.getState().setEmbedHost(host));
    useStylesStore.setState({ editing: { name: 'anima' } });
    render(
      <>
        <StyleEditorOverlay />
        <WildcardOverlay />
      </>,
    );
    await screen.findByLabelText('肯定の文面');
    fireEvent.change(screen.getByLabelText('肯定の文面'), { target: { value: '直しかけ' } });

    act(() => useWildcardsStore.setState({ panelOpen: true }));
    expect(await screen.findByText('編集中の内容')).toBeDefined();

    fireEvent.click(screen.getByText('キャンセル'));
    expect(useWildcardsStore.getState().panelOpen).toBe(false);
    expect(useStylesStore.getState().editing).not.toBeNull();

    act(() => useDialogStore.setState({ embedHost: null, order: [] }));
    host.remove();
  });

  it('一覧を名前と文面で絞り込む。新しいスタイルは絞り込みに拠らず出す', async () => {
    seed();
    useStylesStore.setState({
      table: parseStyleTable(`${SAMPLE}night,"moon, stars",
`),
      editing: { name: 'anima' },
    });
    await show();
    const list = screen.getByRole('navigation', { name: 'スタイルの一覧' });

    fireEvent.change(screen.getByLabelText('スタイルを絞り込む'), { target: { value: 'stars' } });

    expect(within(list).queryByRole('button', { name: 'anima' })).toBeNull();
    expect(within(list).getByRole('button', { name: 'night' })).toBeDefined();
    expect(within(list).getByRole('button', { name: '新しいスタイル' })).toBeDefined();
  });

  it('一覧を掴むと、そのスタイルの肯定の文面をブラウザの文字のドラッグに載せる', async () => {
    seed();
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();
    const list = screen.getByRole('navigation', { name: 'スタイルの一覧' });
    const row = within(list).getByRole('button', { name: 'anima' }).closest('[draggable="true"]');
    const setData = vi.fn();

    expect(row).not.toBeNull();
    fireEvent.dragStart(row as Element, { dataTransfer: { setData, effectAllowed: '' } });

    expect(setData).toHaveBeenCalledWith('text/plain', '1girl, solo');
  });

  it('この画面の中の欄は差し込み先にしない', async () => {
    seed();
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();

    const own = screen.getByLabelText('肯定の文面');
    own.focus();
    fireEvent.focusIn(own);

    const insert = screen.getByLabelText<HTMLButtonElement>('肯定の文面をキャレット位置に取り込む');
    expect(insert.disabled).toBe(true);
  });

  it('1 行の欄は差し込み先にしない', async () => {
    seed();
    const field = document.createElement('input');
    document.body.append(field);
    useStylesStore.setState({ editing: { name: 'anima' } });
    await show();

    field.focus();
    fireEvent.focusIn(field);

    const insert = screen.getByLabelText<HTMLButtonElement>('肯定の文面をキャレット位置に取り込む');
    expect(insert.disabled).toBe(true);

    field.remove();
  });

  it('一覧をダブルクリックすると、そのスタイルの肯定の文面を取り込む', async () => {
    seed();
    const field = document.createElement('textarea');
    field.value = 'a:b';
    document.body.append(field);
    useStylesStore.setState({ editing: { name: null } });
    await show();

    field.focus();
    field.setSelectionRange(2, 2);
    fireEvent.focusIn(field);
    fireEvent.doubleClick(screen.getByRole('button', { name: 'anima' }));

    expect(field.value).toBe('a:1girl, solob');

    field.remove();
  });

  it('閉じていれば何も描かない', () => {
    seed();
    const { container } = render(<StyleEditorOverlay />);

    expect(container.firstChild).toBeNull();
  });
});
