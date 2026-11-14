// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatWorkspace } from '@/components/llm/workspace/ChatWorkspace';
import type { LlmKeyPort } from '@/port/llm-port';
import { installLlmKeyPort } from '@/store/ports/llm-key-port';
import { installLlmPort } from '@/store/ports/llm-port';
import { useChatStore } from '@/store/use-chat-store';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';
import { useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';

import { stubMissingDom } from '../helpers/dom';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import {
  chat,
  chatMessage,
  fakeKeyPort,
  fakeLlmPort,
  modelList,
  profile,
  setDefaultLlm,
  type FakeLlmPort,
} from '../helpers/llm';

// ─────────────────────────────
// 会話の画面。接続の案内・送る操作・候補の切り替え。
// ─────────────────────────────

let port: FakeLlmPort;

beforeEach(() => {
  stubMissingDom();
  port = fakeLlmPort();
  installLlmPort(port);
  useLlmProfilesStore.setState({ profiles: [profile()], checks: {} });
  useChatStore.setState({ chats: {}, places: {}, saveStates: {}, pending: {}, drafts: {} });
  setDefaultLlm();
});

/** キーの無いゲートウェイの窓口（入力の窓だけ差し替える） */
const NO_KEYS: LlmKeyPort = fakeKeyPort();

/** 選んでいる接続の設定がつながっていると確かめた状態にする */
function connected(): void {
  useLlmProfilesStore.setState({
    checks: { p1: { kind: 'ok', models: [], contexts: {}, details: {}, serverContext: null } },
  });
}

afterEach(() => {
  cleanup();
  useChatStore.getState().unload('c1');
  // 接続の案内を出すかはページ全体で持つので、テストごとに戻す
  useLlmConnectDialogStore.setState({ requested: false, dismissed: false });
  useLlmKeysStore.setState({ keyed: [] });
});
describe('長い会話のログ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('新しい 20 件から描き、上へ読みに行くと遠い側を外し、下へ戻ると最新を描き直す', () => {
    // 先頭・末尾の目印のどちらが見えたかを試験から起こす（先に見張るのが先頭）
    let report: ((onTop: boolean, onBottom: boolean) => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly #callback: IntersectionObserverCallback;
        readonly #targets: Element[] = [];
        constructor(callback: IntersectionObserverCallback) {
          this.#callback = callback;
          report = (onTop, onBottom) =>
            this.#callback(
              this.#targets.map((target, index) => ({
                target,
                isIntersecting: index === 0 ? onTop : onBottom,
              })) as unknown as IntersectionObserverEntry[],
              this as unknown as IntersectionObserver,
            );
        }
        observe(target: Element): void {
          this.#targets.push(target);
        }
        disconnect(): void {}
      },
    );
    // 発言は 1 件 1000px の高さに並び、ログの欄は `view` の位置を映す
    const HEIGHT = 1000;
    let view = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('role') === 'log') {
        return { top: view, bottom: view + HEIGHT } as DOMRect;
      }
      const at = Number(/本文 (\d+)/u.exec(this.textContent)?.[1] ?? 0);
      return { top: at * HEIGHT, bottom: (at + 1) * HEIGHT } as DOMRect;
    });
    connected();
    const messages = Array.from({ length: 240 }, (_, index) =>
      chatMessage(`m${String(index)}`, index % 2 === 0 ? 'user' : 'assistant', [
        `本文 ${String(index)}`,
      ]),
    );
    useChatStore.getState().put('c1', chat(messages));
    const { container } = render(<ChatWorkspace chatId="c1" />);
    const drawn = (): number =>
      container.querySelectorAll(
        '[aria-label="あなたのメッセージ"],[aria-label="アシスタントのメッセージ"]',
      ).length;

    expect(drawn()).toBe(20);
    for (let round = 0; round < 4; round += 1) act(() => report?.(true, false));
    expect(drawn()).toBe(100);
    expect(screen.getByText('本文 239')).toBeTruthy();

    // 最新の側を見ているうちは、見えている発言を外さない
    view = 238 * HEIGHT;
    act(() => report?.(true, false));
    expect(screen.getByText('本文 239')).toBeTruthy();

    view = 120 * HEIGHT;
    act(() => report?.(true, false));
    expect(screen.queryByText('本文 239')).toBeNull();

    view = 200 * HEIGHT;
    for (let round = 0; round < 2; round += 1) act(() => report?.(false, true));
    expect(screen.getByText('本文 239')).toBeTruthy();
  });
});
describe('会話の大きさの上限', () => {
  afterEach(() => useSettingsStore.setState({ chatMaxMegabytes: 10 }));

  const big = (size: number) =>
    chat([chatMessage('u1', 'user', ['q']), chatMessage('a1', 'assistant', ['x'.repeat(size)])]);

  it('上限の 9 割を超えたら注意だけを出し、送れる', () => {
    connected();
    useSettingsStore.setState({ chatMaxMegabytes: 1 });
    useChatStore.getState().put('c1', big(Math.round(0.95 * 1024 * 1024)));
    useChatStore.getState().setDraft('c1', 'hi');
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.getByText(/1 MB を超えると、この会話では送れなくなります/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: '送る' }).hasAttribute('disabled')).toBe(false);
  });

  it('上限を超えたら理由を出し、この会話では送れなくする。上限を上げれば送れる', () => {
    connected();
    useSettingsStore.setState({ chatMaxMegabytes: 1 });
    useChatStore.getState().put('c1', big(Math.round(1.1 * 1024 * 1024)));
    useChatStore.getState().setDraft('c1', 'hi');
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.getByRole('alert').textContent).toContain('上限の 1 MB を超えた');
    expect(screen.getByRole('button', { name: '送る' }).hasAttribute('disabled')).toBe(true);

    act(() => {
      useSettingsStore.setState({ chatMaxMegabytes: 2 });
    });
    expect(screen.getByRole('button', { name: '送る' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('会話の画面', () => {
  it('フォークのアイコンは応答にだけ出す', () => {
    connected();
    useChatStore
      .getState()
      .put('c1', chat([chatMessage('u1', 'user', ['q']), chatMessage('a1', 'assistant', ['a'])]));
    render(<ChatWorkspace chatId="c1" />);
    const forks = screen.getAllByRole('button', { name: 'ここまでをフォーク' });
    expect(forks).toHaveLength(1);
    expect(forks[0]?.hasAttribute('disabled')).toBe(false);
  });

  it('接続の案内の「会話を始める」で、設定と既定のモデルを全体に入れる', () => {
    useLlmProfilesStore.setState({ profiles: [profile({ defaultModel: 'm1' })] });
    useSettingsStore.setState({ llmProfileId: null, llmModel: '' });
    useChatStore.getState().put('c1', chat([]));
    useLlmConnectDialogStore.getState().open();
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.queryByRole('log')).toBeNull();
    // 接続の案内にモデルの欄は無い（モデルは入力欄の横で選ぶ）
    expect(screen.queryByRole('button', { name: /^モデル:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '会話を始める' }));
    expect(useSettingsStore.getState()).toMatchObject({ llmProfileId: 'p1', llmModel: 'm1' });
    expect(screen.getByRole('log')).toBeTruthy();
    // 入力欄の横のモデルの欄は、選んだ名前を出す開くボタン
    expect(screen.getByRole('button', { name: 'モデル: m1（選ぶ）' })).toBeTruthy();
  });

  it('つないでいなければ、会話の画面はそのまま出し、接続の案内をダイアログで重ねる', () => {
    useLlmProfilesStore.setState({ profiles: [] });
    useChatStore.getState().put('c1', chat([chatMessage('u1', 'user', ['saved text'])]));
    render(<ChatWorkspace chatId="c1" />);
    // 会話の画面はダイアログの後ろに残る（ダイアログが開いている間は読み上げから外れる）
    const log = screen.getByRole('log', { hidden: true });
    expect(log.textContent).toContain('saved text');
    const dialog = screen.getByRole('dialog', { name: 'LLM に接続する' });
    expect(dialog.contains(screen.getByRole('button', { name: '会話を始める' }))).toBe(true);
    // 末尾に CORS の許可設定と、外部のクラウドに送る中身・料金・キーの注意を閉じて置く
    const notes = screen.getByText('セキュリティの注意').closest('details');
    expect(dialog.contains(notes)).toBe(true);
    expect(notes?.querySelectorAll('li')).toHaveLength(6);
    expect(notes?.textContent).toContain('許可する URL をこのページに制限することを推奨します');
    // 送るボタンは接続断のアイコンに替わり、押すと接続の案内を出す
    expect(screen.queryByRole('button', { hidden: true, name: '送る' })).toBeNull();
    const connect = screen.getByRole('button', { hidden: true, name: 'LLM に接続する' });
    expect(connect.querySelector('svg')?.getAttribute('class')).toContain('lucide-unplug');
    expect(connect.hasAttribute('disabled')).toBe(false);
  });

  it('接続の案内を閉じても会話の画面はそのまま', async () => {
    useLlmProfilesStore.setState({ profiles: [] });
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('log')).toBeTruthy();
  });

  it('接続を押すと、同じベース URL の接続の設定を選び、無ければ作って選ぶ', () => {
    useLlmProfilesStore.setState({ profiles: [] });
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    const url = screen.getByRole('combobox', { name: 'ベース URL' });
    fireEvent.change(url, { target: { value: 'http://y/v1' } });
    // 打っているだけでは作らない
    expect(useLlmProfilesStore.getState().profiles).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    expect(useLlmProfilesStore.getState().profiles.map((item) => item.baseUrl)).toEqual([
      'http://y/v1',
    ]);

    // 同じ URL でもう一度つないでも増やさない
    fireEvent.change(screen.getByRole('combobox', { name: 'ベース URL' }), {
      target: { value: 'http://y/v1/' },
    });
    fireEvent.click(screen.getByRole('button', { name: /接続/ }));
    expect(useLlmProfilesStore.getState().profiles).toHaveLength(1);
  });

  it('選んでいる設定には開いたときに 1 回だけ自動でつなぎ、「接続済み」を「再接続」の右に出す', async () => {
    let calls = 0;
    installLlmPort({
      ...port,
      listModels: () => {
        calls += 1;
        return Promise.resolve({ ok: true, value: modelList(['m']) });
      },
    });
    useLlmProfilesStore.setState({ profiles: [profile({ id: 'auto-1' })] });
    useChatStore.getState().put('c1', chat([]));
    const view = render(<ChatWorkspace chatId="c1" />);
    expect(await screen.findByRole('button', { name: '再接続' })).toBeTruthy();
    // アバターの並べ替え（dnd-kit）も読み上げの status を置くので、文で引く
    const status = screen.getByText('接続済み - モデル 1 件');
    expect(status.getAttribute('role')).toBe('status');
    // 再接続のボタンと同じ行の、すぐ右に出す
    expect(screen.getByRole('button', { name: '再接続' }).nextElementSibling).toBe(status);

    // 開き直しても、もう自動では試さない
    view.unmount();
    render(<ChatWorkspace chatId="c1" />);
    expect(calls).toBe(1);
  });

  it('失敗したら「接続」に戻して原因を出し、自動では繰り返さない', async () => {
    let calls = 0;
    installLlmPort({
      ...port,
      listModels: () => {
        calls += 1;
        return Promise.resolve({ ok: false, failure: { kind: 'unreachable' } });
      },
    });
    useLlmProfilesStore.setState({ profiles: [profile({ id: 'auto-2' })] });
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    const alert = await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '接続' })).toBeTruthy();
    expect(calls).toBe(1);
    // 失敗は API キーをセットのボタンの下、ローカルネットワークの許可の案内のさらに下に出す
    const key = screen.getByRole('button', { name: 'API キーをセット' });
    const note = screen.getByText(/ローカルネットワークへのアクセス許可/);
    expect(key.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('開いた直後の自動の接続を待つ間は、接続の案内のダイアログを出さない', () => {
    installLlmPort({ ...port, listModels: () => new Promise(() => undefined) });
    useLlmProfilesStore.setState({ profiles: [profile({ id: 'auto-4' })] });
    useSettingsStore.setState({ llmProfileId: 'auto-4', llmModel: 'm' });
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('つないでいる会話は会話の画面だけを出し、再接続で頼まれたら接続の案内のダイアログを重ねる', async () => {
    installLlmPort({
      ...port,
      listModels: () => Promise.resolve({ ok: true, value: modelList(['m']) }),
    });
    useLlmProfilesStore.setState({ profiles: [profile({ id: 'auto-3' })] });
    useSettingsStore.setState({ llmProfileId: 'auto-3', llmModel: 'm' });
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    expect(await screen.findByRole('textbox', { name: 'メッセージ' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useLlmConnectDialogStore.getState().open());
    expect(screen.getByRole('dialog', { name: 'LLM に接続する' })).toBeTruthy();
    // 会話の画面はそのまま（ダイアログの後ろ）
    expect(screen.getByRole('textbox', { hidden: true, name: 'メッセージ' })).toBeTruthy();
    // 埋め込みへの切り替えは持たない（× だけ）
    expect(screen.queryByRole('button', { name: /埋め込み/ })).toBeNull();
  });

  it('一度閉じたら、つないでいない別の会話に替えても自動では出さない', async () => {
    useLlmProfilesStore.setState({ profiles: [] });
    useChatStore.getState().put('c1', chat([]));
    useChatStore.getState().put('c2', chat([]));
    const view = render(<ChatWorkspace chatId="c1" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    view.rerender(<ChatWorkspace key="c2" chatId="c2" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    useChatStore.getState().unload('c2');
  });

  it('空のベース URL の欄で Tab を押すと例が入る', () => {
    useSettingsStore.setState({ llmModel: '' });
    useChatStore.getState().put('c1', chat([]));
    useLlmProfilesStore.setState({ profiles: [profile({ baseUrl: '' })] });
    render(<ChatWorkspace chatId="c1" />);
    const url = screen.getByRole('combobox', { name: 'ベース URL' });
    fireEvent.keyDown(url, { key: 'Tab' });
    expect((url as HTMLInputElement).value).toBe('http://127.0.0.1:11434/v1');
  });

  it('入力欄の下に、応答が AI の生成である知らせを会話の前から出す', () => {
    useChatStore.getState().put('c1', chat([]));
    render(<ChatWorkspace chatId="c1" />);
    expect(
      screen.getByText('応答は AI が生成します。誤りや不正確な内容が含まれることがあります。'),
    ).toBeTruthy();
  });

  it('つないでいない間は送らず、Enter と送るボタンで接続の案内を出す（閉じた後でも）', async () => {
    useChatStore.getState().put('c1', chat());
    // 一度閉じた後（自動では出さない）
    useLlmConnectDialogStore.setState({ dismissed: true });
    render(<ChatWorkspace chatId="c1" />);
    const input = screen.getByRole('textbox', { name: 'メッセージ' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(port.requests).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'LLM に接続する' })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 送れない理由を title に出す送るボタン（構成の相談の送るボタンとは別）。押せるままにする
    const button = screen.getByTitle('先に接続の設定とモデルを選んでください');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(port.requests).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'LLM に接続する' })).toBeTruthy();
  });

  it('つながっていてモデルを選んでいない間は、送るボタンを接続のアイコンにし、押すとモデルを選ぶ', async () => {
    useSettingsStore.setState({ llmModel: '' });
    connected();
    useChatStore.getState().put('c1', chat());
    render(<ChatWorkspace chatId="c1" />);
    // モデルの欄は青い枠で選ぶ場所を示す
    expect(screen.getByRole('button', { name: 'モデルを選択' }).className).toContain('ring-1');
    const input = screen.getByRole('textbox', { name: 'メッセージ' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(port.requests).toHaveLength(0);
    expect(await screen.findByRole('dialog', { name: 'モデルを選ぶ' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'LLM に接続する' })).toBeNull();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByTitle('先にモデルを選んでください'));
    expect(await screen.findByRole('dialog', { name: 'モデルを選ぶ' })).toBeTruthy();
  });

  it('キーが要るのにゲートウェイに無い間は、送るボタンを鍵にし、押すと（Enter でも）入力の窓を開く', () => {
    const openEntry = vi.fn<LlmKeyPort['openEntry']>(() => 'opened');
    installLlmKeyPort({ ...NO_KEYS, openEntry });
    const base = profile().baseUrl;
    useLlmProfilesStore.setState({ profiles: [profile({ keyRequired: true })] });
    useLlmKeysStore.setState({ keyed: [] });
    connected();
    useChatStore.getState().put('c1', chat());
    render(<ChatWorkspace chatId="c1" />);
    fireEvent.click(screen.getByTitle('先に API キーをセットしてください'));
    expect(openEntry).toHaveBeenCalledWith(base);
    const input = screen.getByRole('textbox', { name: 'メッセージ' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(openEntry).toHaveBeenCalledTimes(2);
    expect(port.requests).toHaveLength(0);

    act(() => useLlmKeysStore.setState({ keyed: [base] }));
    expect(screen.queryByTitle('先に API キーをセットしてください')).toBeNull();
  });

  it('外部の接続先で注意に合意していなければ、鍵を押すと先に注意を出し、合意したら窓を開く', () => {
    const openEntry = vi.fn<LlmKeyPort['openEntry']>(() => 'opened');
    installLlmKeyPort({ ...NO_KEYS, openEntry });
    const base = 'https://openrouter.ai/api/v1';
    useLlmProfilesStore.setState({ profiles: [profile({ baseUrl: base })] });
    useLlmKeysStore.setState({ keyed: [] });
    useTermsStore.setState({ cloud: null });
    connected();
    useChatStore.getState().put('c1', chat());
    render(<ChatWorkspace chatId="c1" />);
    fireEvent.click(screen.getByTitle('先に API キーをセットしてください'));
    expect(openEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '同意して接続' }));
    expect(openEntry).toHaveBeenCalledWith(base);
  });

  it('キーの要らない設定でも、キーが断られたら送るボタンを鍵にする', () => {
    useLlmProfilesStore.setState({ checks: { p1: { kind: 'failed', failure: { kind: 'auth' } } } });
    useChatStore.getState().put('c1', chat());
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.getByTitle('先に API キーをセットしてください')).toBeTruthy();
  });

  it('自動で出した接続の案内は、つながっても閉じない', async () => {
    useChatStore.getState().put('c1', chat());
    useLlmProfilesStore.setState({
      checks: { p1: { kind: 'failed', failure: { kind: 'unreachable' } } },
    });
    render(<ChatWorkspace chatId="c1" />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    act(() => connected());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Enter で送り、Shift+Enter と文字の変換中の Enter では送らない', () => {
    useChatStore.getState().put('c1', chat());
    connected();
    render(<ChatWorkspace chatId="c1" />);
    const input = screen.getByRole('textbox', { name: 'メッセージ' });
    fireEvent.change(input, { target: { value: 'hello' } });

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(port.requests).toHaveLength(0);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(port.requests).toHaveLength(1);
    // 受け取り中は送るボタンが止めるボタンに替わる
    expect(screen.getByRole('button', { name: '止める' })).toBeTruthy();
  });

  it('受け取り中の Esc で止め、文字の変換を取り消す Esc では止めない', () => {
    useChatStore.getState().put('c1', chat());
    connected();
    render(<ChatWorkspace chatId="c1" />);
    const input = screen.getByRole('textbox', { name: 'メッセージ' });
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const stop = vi.spyOn(useChatStore.getState(), 'stop');

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 229 });
    expect(stop).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(stop).toHaveBeenCalledWith('c1');
  });

  it('候補が 2 つ以上あれば切り替えを出し、押すと選んでいる候補が替わる', () => {
    connected();
    useChatStore
      .getState()
      .put(
        'c1',
        chat([chatMessage('u1', 'user', ['hi']), chatMessage('a1', 'assistant', ['A', 'B'], 1)]),
      );
    render(<ChatWorkspace chatId="c1" />);
    expect(screen.getByText('B')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '前の候補' }));
    expect(screen.getByText('A')).toBeTruthy();
    expect(useChatStore.getState().chats.c1?.messages[1]?.selected).toBe(0);
  });
  it('注記の枠は入力欄の上に読むだけで出し、× で外す', () => {
    connected();
    useChatStore.getState().put('c1', chat([]));
    useChatStore.getState().setDraftNote('c1', 'Press regenerate.');
    render(<ChatWorkspace chatId="c1" />);
    const note = screen.getByRole('note', { name: '注記（送りません）' });
    expect(note.textContent).toContain('Press regenerate.');
    expect(note.querySelector('textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '注記を外す' }));
    expect(screen.queryByRole('note', { name: '注記（送りません）' })).toBeNull();
  });

  it('会話のタブを開いて閉じても、閉じた画面を残さない', async () => {
    connected();
    const leak = leakWatch();
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      const chatId = `leak-${String(round)}`;
      useChatStore
        .getState()
        .put(
          chatId,
          chat([chatMessage('u', 'user', ['hi']), chatMessage('a', 'assistant', ['A'])]),
        );
      const view = render(<ChatWorkspace chatId={chatId} />);
      leak.watch(screen.getByRole('log'));
      view.unmount();
      useChatStore.getState().unload(chatId);
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
