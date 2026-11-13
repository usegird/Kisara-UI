// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComfyConnectDialog } from '@/components/comfy/dialogs/ComfyConnectDialog';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// 「ComfyUI に接続する」のポップアップ。つないでいなければ自動で 1 度出し、
// 閉じたらこのページでは自動で出さない（ワークフローを開いていないタブでは出し続ける）。
// 再接続で頼まれたら、つないでいても出す
// ─────────────────────────────

const NAME = 'ComfyUI に接続する';

beforeEach(() => {
  useSettingsStore.setState({ baseUrl: '' });
  useConnectionStore.getState().reset();
  useConnectionStore.setState({ probe: () => Promise.resolve(false) });
  useComfyConnectDialogStore.setState({ requested: false, dismissed: false, autoTried: false });
});

afterEach(cleanup);

describe('自動で出す', () => {
  it('起動時の自動接続を試すまでは出さず、試した後でつないでいなければ出す', () => {
    render(<ComfyConnectDialog auto pinned={false} />);
    expect(screen.queryByRole('dialog', { name: NAME })).toBeNull();
    act(() => useComfyConnectDialogStore.getState().markAutoTried());
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
  });

  it('つないでいる途中・つながっている・つなぎ直しで未接続にしている間は出さない', () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'connecting' });
    const { rerender } = render(<ComfyConnectDialog auto pinned={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useConnectionStore.setState({ status: 'connected' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useConnectionStore.getState().pause());
    rerender(<ComfyConnectDialog auto pinned={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('閉じたら、つないでいなくても自動では出さない。自動で出さない画面（画像のタブ）でも出さない', async () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    const { rerender } = render(<ComfyConnectDialog auto pinned={false} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useComfyConnectDialogStore.getState().dismissed).toBe(true);

    useComfyConnectDialogStore.setState({ dismissed: false });
    rerender(<ComfyConnectDialog auto={false} pinned={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ワークフローを開いていないタブ', () => {
  it('閉じてもすぐ出し直し、外を触れるよう暗くしない。つながっても下ろさない', () => {
    useComfyConnectDialogStore.setState({ autoTried: true });
    useConnectionStore.setState({ status: 'failed' });
    render(<ComfyConnectDialog auto pinned />);
    expect(document.querySelector('[data-dialog-backdrop]')).toBeNull();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useComfyConnectDialogStore.getState().dismissed).toBe(true);
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();

    act(() => useConnectionStore.setState({ status: 'connected' }));
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();

    // 起動時の自動接続を試す前は出さない
    act(() => useComfyConnectDialogStore.setState({ autoTried: false }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('再接続で出す', () => {
  it('つながっていても、自動で出さない画面でも出し、つながったと知らされたら下ろす', async () => {
    useConnectionStore.setState({ status: 'connected' });
    render(<ComfyConnectDialog auto={false} pinned={false} />);
    act(() => useComfyConnectDialogStore.getState().open());
    expect(screen.getByRole('dialog', { name: NAME })).toBeTruthy();
    act(() => useComfyConnectDialogStore.getState().connected());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('漏れ', () => {
  it('出して閉じるのを繰り返しても、閉じた中身を残さない', async () => {
    const leak = leakWatch();
    render(<ComfyConnectDialog auto={false} pinned={false} />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      act(() => useComfyConnectDialogStore.getState().open());
      leak.watch(await screen.findByRole('dialog'));
      act(() => useComfyConnectDialogStore.getState().close());
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
