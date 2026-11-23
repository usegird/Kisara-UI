// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComfyConnectDialog } from '@/components/comfy/dialogs/ComfyConnectDialog';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

const NAME = 'ComfyUI に接続する';

beforeEach(() => {
  useSettingsStore.setState({ baseUrl: '', chatSidebarWidth: 240 });
  useConnectionStore.getState().reset();
  useConnectionStore.setState({ probe: () => Promise.resolve(false) });
  useComfyConnectDialogStore.setState({ requested: false, dismissed: false, autoTried: false });
});

afterEach(cleanup);

describe('自動で出す', () => {
  it('起動時の自動接続を試すまでは出さず、試した後でつないでいなければ出す', () => {
    render(<ComfyConnectDialog auto pinned={false} covered={false} listShown={false} />);
    expect(screen.queryByRole('dialog', { name: NAME })).toBeNull();
    act(() => useComfyConnectDialogStore.getState().markAutoTried());
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
  });

  it('つないでいる途中・つながっている・つなぎ直しで未接続にしている間は出さない', () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'connecting' });
    const { rerender } = render(
      <ComfyConnectDialog auto pinned={false} covered={false} listShown={false} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useConnectionStore.setState({ status: 'connected' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useConnectionStore.getState().pause());
    rerender(<ComfyConnectDialog auto pinned={false} covered={false} listShown={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('閉じたら、つないでいなくても自動では出さない。自動で出さない画面（画像のタブ）でも出さない', async () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    const { rerender } = render(
      <ComfyConnectDialog auto pinned={false} covered={false} listShown={false} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useComfyConnectDialogStore.getState().dismissed).toBe(true);

    useComfyConnectDialogStore.setState({ dismissed: false });
    rerender(<ComfyConnectDialog auto={false} pinned={false} covered={false} listShown={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ワークフローを開いていないタブ', () => {
  it('外を触れるよう暗くしない。× や Esc で閉じたら出さない', async () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    render(<ComfyConnectDialog auto pinned covered={false} listShown={false} />);
    expect(document.querySelector('[data-dialog-backdrop]')).toBeNull();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useComfyConnectDialogStore.getState().dismissed).toBe(true);
  });

  it('つながったら下ろす', async () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    render(<ComfyConnectDialog auto pinned covered={false} listShown={false} />);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
    act(() => useConnectionStore.setState({ status: 'connected' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('テンプレートを選ぶダイアログを開いている間は引っ込め、閉じたらまた出す', () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    const { rerender } = render(<ComfyConnectDialog auto pinned covered listShown={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<ComfyConnectDialog auto pinned covered={false} listShown={false} />);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
  });

  it('ワークフローの一覧に重なる幅なら一覧を優先して出さず、重ならない幅なら出す', () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    useSettingsStore.setState({ chatSidebarWidth: 300 });
    const { rerender } = render(<ComfyConnectDialog auto pinned covered={false} listShown />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      useSettingsStore.setState({ chatSidebarWidth: 200 });
    });
    rerender(<ComfyConnectDialog auto pinned covered={false} listShown />);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
  });
});

describe('再接続で出す', () => {
  it('つながっていても、自動で出さない画面でも出し、つながったと知らされたら下ろす', async () => {
    useConnectionStore.setState({ status: 'connected' });
    render(<ComfyConnectDialog auto={false} pinned={false} covered={false} listShown={false} />);
    act(() => useComfyConnectDialogStore.getState().open());
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
    act(() => useComfyConnectDialogStore.getState().connected());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('漏れ', () => {
  it('出して閉じるのを繰り返しても、閉じた中身を残さない', async () => {
    const leak = leakWatch();
    render(<ComfyConnectDialog auto={false} pinned={false} covered={false} listShown={false} />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      act(() => useComfyConnectDialogStore.getState().open());
      leak.watch(await screen.findByRole('dialog'));
      act(() => useComfyConnectDialogStore.getState().close());
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
