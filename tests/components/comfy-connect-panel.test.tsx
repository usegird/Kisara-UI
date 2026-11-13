// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComfyConnectPanel } from '@/components/comfy/dialogs/ComfyConnectPanel';
import { useComfyConnection } from '@/hooks/comfy/use-comfy-connection';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';

import { acceptTerms } from '../helpers/connection';

// ─────────────────────────────
// 「ComfyUI に接続する」のポップアップの中身。失敗の案内は帯ではなく、この中に出す
// ─────────────────────────────

const BASE_URL = 'http://127.0.0.1:8188';
function show(): void {
  render(<ComfyConnectPanel />);
}

beforeEach(() => {
  useSettingsStore.setState({ baseUrl: BASE_URL });
  useConnectionStore.getState().reset();
  // 起動時の自動接続で通信させない
  useConnectionStore.setState({ probe: () => Promise.resolve(false) });
});

afterEach(() => {
  cleanup();
});

describe('接続の案内', () => {
  it('応答が無いときは、接続先の名前を挙げて確かめることを示す', () => {
    useConnectionStore.setState({
      status: 'failed',
      diagnosis: { code: 'down', targetUrl: `${BASE_URL}/features` },
    });
    show();

    // 入力欄を後から書き換えても、文は実際に失敗した要求の宛先のまま
    useSettingsStore.setState({ baseUrl: 'http://example.test:1' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(`${BASE_URL}/features が応答しません`);
    expect(alert.textContent).toContain('起動済みであることや、URL やポートに誤りがないか');
  });

  it('失敗していなければ案内を出さない', () => {
    show();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('末尾に起動オプションのリスクの解説を閉じて置く', () => {
    show();
    const summary = screen.getByText('セキュリティの注意');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    expect(details?.querySelectorAll('li')).toHaveLength(6);
    expect(details?.textContent).toContain('--listen');
  });
});

describe('接続のボタン', () => {
  it('「再接続」はつながっている間だけ。失敗したあとは「接続」に戻る', () => {
    show();
    expect(screen.getByRole('button', { name: '接続' })).toBeTruthy();
    cleanup();

    useConnectionStore.setState({ status: 'failed' });
    show();
    expect(screen.getByRole('button', { name: '接続' })).toBeTruthy();
    cleanup();

    // 起動時の自動接続で状態を書き換えさせない（接続先が空なら試さない）
    useSettingsStore.setState({ baseUrl: '' });
    useConnectionStore.setState({ status: 'connected' });
    show();
    expect(screen.getByRole('button', { name: '再接続' })).toBeTruthy();
  });

  it('状況は失敗の案内と同じ場所に出す（つないでいる途中・つながっている）', () => {
    useSettingsStore.setState({ baseUrl: '' });
    useConnectionStore.setState({ status: 'connecting' });
    show();
    expect(screen.getByRole('status').textContent).toBe('接続しています…');
    cleanup();

    useConnectionStore.setState({ status: 'connected' });
    show();
    expect(screen.getByRole('status').textContent).toBe('接続済み');
  });
});

describe('再接続のボタン', () => {
  it('つないでいる途中と、つなぎ直しで未接続にしている間は押せない', () => {
    useConnectionStore.setState({ status: 'connecting' });
    show();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '接続' }).disabled).toBe(true);
    cleanup();

    useConnectionStore.getState().pause();
    show();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '接続' }).disabled).toBe(true);
  });
});

describe('自動の接続', () => {
  function countProbes(): () => number {
    let probes = 0;
    useConnectionStore.setState({
      probe: () => {
        probes += 1;
        return Promise.resolve(false);
      },
    });
    return () => probes;
  }

  // 自動の接続は AppShell の 1 か所だけ。ここでも持つと起動時に 2 回試した
  it('案内を開いても、接続先が入っていて同意済みでも自分では試さない', async () => {
    acceptTerms();
    const probes = countProbes();
    show();
    await act(() => Promise.resolve());
    expect(probes()).toBe(0);
  });

  it('開いた時点で接続先が空なら、後から打ち込んでも勝手には試さない', async () => {
    acceptTerms();
    const probes = countProbes();
    useSettingsStore.setState({ baseUrl: '' });
    renderHook(() => useComfyConnection());
    await act(() => {
      useSettingsStore.setState({ baseUrl: BASE_URL });
      return Promise.resolve();
    });
    expect(probes()).toBe(0);
  });
});

describe('接続先の欄', () => {
  // 打つたびに接続先を変えると、つながっている通知が不正な URL を組み立てて画面ごと止まった
  it('打ちかけの値は接続先にせず、接続を押したときにその値でつなぐ', async () => {
    acceptTerms();
    const probed: string[] = [];
    useConnectionStore.setState({
      probe: (url) => {
        probed.push(url);
        return Promise.resolve(false);
      },
    });
    show();
    const input = screen.getByLabelText<HTMLInputElement>('接続先 ComfyUI の URL');

    fireEvent.change(input, { target: { value: 'http://localhost:5173x' } });
    expect(input.value).toBe('http://localhost:5173x');
    expect(useSettingsStore.getState().baseUrl).toBe(BASE_URL);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '接続' }));
      await Promise.resolve();
    });
    expect(probed).toEqual(['http://localhost:5173x']);
    expect(useSettingsStore.getState().baseUrl).toBe('http://localhost:5173x');
  });

  it('ほかの所でつなぎ直して接続先が変わったら、打ちかけを捨ててそれに揃える', () => {
    show();
    const input = screen.getByLabelText<HTMLInputElement>('接続先 ComfyUI の URL');
    fireEvent.change(input, { target: { value: 'http://a' } });

    act(() => {
      useSettingsStore.setState({ baseUrl: 'http://b:8188' });
    });
    expect(input.value).toBe('http://b:8188');
  });
});
describe('外部の ComfyUI に接続する注意', () => {
  const REMOTE = 'https://abc-8188.proxy.runpod.net';
  // 押下の見張り（同じ鍵は 300ms の間だけ捨てる）に、前の試験の押下を引きずらせない
  let now = 10_000_000;

  beforeEach(() => {
    now += 60_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    acceptTerms();
    useTermsStore.setState({ comfyRemote: null });
    useComfyConnectDialogStore.setState({ remotePending: null, requested: false });
    useSettingsStore.setState({ baseUrl: REMOTE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useTermsStore.setState({ comfyRemote: null });
    useComfyConnectDialogStore.setState({ remotePending: null, requested: false });
  });

  it('私的なアドレスの外へは注意に合意するまでつながず、やめたら合意も残さない', async () => {
    const probe = vi.fn(() => Promise.resolve(false));
    useConnectionStore.setState({ probe });
    show();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    await act(() => Promise.resolve());
    expect(probe).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: '外部の ComfyUI に接続する注意' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(useTermsStore.getState().comfyRemote).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it('同意したら日時を残してつなぐ', async () => {
    const probe = vi.fn(() => Promise.resolve(false));
    useConnectionStore.setState({ probe });
    show();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    await act(() => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: '同意して接続' }));
    expect(useTermsStore.getState().comfyRemote?.acceptedAt).toMatch(/^\d{4}-/);
    await waitFor(() => expect(probe).toHaveBeenCalledWith(REMOTE));
  });

  it('手元の接続先には注意を出さずにつなぐ', async () => {
    useSettingsStore.setState({ baseUrl: BASE_URL });
    const probe = vi.fn(() => Promise.resolve(false));
    useConnectionStore.setState({ probe });
    show();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    await waitFor(() => expect(probe).toHaveBeenCalledWith(BASE_URL));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
