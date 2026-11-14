// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LlmConnectionNotice,
  LlmEndpointField,
} from '@/components/llm/side-panel/LlmEndpointField';
import type { LlmKeyPort } from '@/port/llm-port';
import { installLlmKeyPort } from '@/store/ports/llm-key-port';
import { installLlmPort } from '@/store/ports/llm-port';
import { useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { cloudAgreed, useTermsStore } from '@/store/use-terms-store';

import { fakeKeyPort, fakeLlmPort, profile } from '../helpers/llm';

// ─────────────────────────────
// 接続の欄は API キーを受けず、ゲートウェイの入力の窓を開く。打った値は送るまで接続の設定に書かない
// ─────────────────────────────

const OPENROUTER = 'https://openrouter.ai/api/v1';

let openEntry: ReturnType<typeof vi.fn<LlmKeyPort['openEntry']>>;

beforeEach(() => {
  installLlmPort(fakeLlmPort());
  openEntry = vi.fn<LlmKeyPort['openEntry']>(() => 'opened');
  installLlmKeyPort(fakeKeyPort({ openEntry }));
  useLlmProfilesStore.setState({
    profiles: [profile({ id: 'p1', baseUrl: '' }), profile({ id: 'cloud', baseUrl: OPENROUTER })],
    checks: {},
  });
});

afterEach(cleanup);

const urlField = () => screen.getByRole<HTMLInputElement>('combobox', { name: 'ベース URL' });
const enterButton = () => screen.getByRole('button', { name: 'API キーをセット' });
const stored = (id: string) => useLlmProfilesStore.getState().profiles.find((p) => p.id === id);

describe('API キーの入れ方', () => {
  it('本体の画面にはキーの欄を置かない', () => {
    const { container } = render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('input[autocomplete="current-password"]')).toBeNull();
  });

  it('ボタンで欄のベース URL を渡して入力の窓を開く', () => {
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: OPENROUTER } });
    fireEvent.click(enterButton());
    expect(openEntry).toHaveBeenCalledWith(OPENROUTER);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('外部クラウド接続の注意に合意していなければ、先に注意を出し、合意したら窓を開く', () => {
    useTermsStore.setState({ cloud: null });
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: OPENROUTER } });
    fireEvent.click(enterButton());
    expect(openEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(openEntry).not.toHaveBeenCalled();

    fireEvent.click(enterButton());
    fireEvent.click(screen.getByRole('button', { name: '同意して接続' }));
    expect(openEntry).toHaveBeenCalledWith(OPENROUTER);
    expect(cloudAgreed()).toBe(true);
  });

  it('ポップアップを止められたら、許可を求める', () => {
    openEntry.mockReturnValue('blocked');
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: OPENROUTER } });
    fireEvent.click(enterButton());
    expect(screen.getByRole('alert').textContent).toContain('ポップアップ');
  });

  it('ゲートウェイとまだつながっていなければ、ポップアップの許可は求めずその旨を出す', () => {
    openEntry.mockReturnValue('unready');
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: OPENROUTER } });
    fireEvent.click(enterButton());
    const text = screen.getByRole('alert').textContent;
    expect(text).toContain('ゲートウェイにまだつながっていません');
    expect(text).not.toContain('ポップアップ');
  });

  it('ゲートウェイにその接続先のキーが入ったら、入れたことだけを出す', () => {
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: `${OPENROUTER}/` } });
    expect(screen.queryByText('設定済')).toBeNull();
    act(() => useLlmKeysStore.setState({ keyed: [OPENROUTER] }));
    expect(screen.getByText('設定済')).toBeTruthy();

    // そのキーで同じ接続先の設定がつながったら、検証済みと出す
    const ok = { kind: 'ok', models: [], contexts: {}, details: {}, serverContext: null } as const;
    act(() => useLlmProfilesStore.setState({ checks: { cloud: ok } }));
    expect(screen.getByText('API キー検証済み')).toBeTruthy();
    expect(screen.queryByText('設定済')).toBeNull();
  });

  it('キーがあるときだけ消すボタンを出し、押すと欄のベース URL のキーを外させる', () => {
    const forgetKey = vi.fn<LlmKeyPort['forgetKey']>();
    installLlmKeyPort(fakeKeyPort({ forgetKey }));
    useLlmKeysStore.setState({ keyed: [] });
    render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
    fireEvent.change(urlField(), { target: { value: OPENROUTER } });
    expect(screen.queryByRole('button', { name: 'API キーを消す' })).toBeNull();
    act(() => useLlmKeysStore.setState({ keyed: [OPENROUTER] }));
    fireEvent.click(screen.getByRole('button', { name: 'API キーを消す' }));
    expect(forgetKey).toHaveBeenCalledWith(OPENROUTER);
  });

  it('送ったら同じ URL の設定を選び、キーを入れたかを書く', () => {
    useLlmKeysStore.setState({ keyed: [OPENROUTER] });
    const onProfile = vi.fn();
    render(<LlmEndpointField profileId="p1" onProfile={onProfile} />);
    fireEvent.change(urlField(), { target: { value: `${OPENROUTER}/` } });
    expect(stored('cloud')?.keyRequired).toBe(false);

    fireEvent.submit(urlField().closest('form') as HTMLFormElement);
    expect(stored('cloud')?.keyRequired).toBe(true);
    expect(onProfile).toHaveBeenCalledWith('cloud');
  });
});

describe('キー無しでつながったとき', () => {
  const OK = { kind: 'ok', models: ['m'], contexts: {}, details: {}, serverContext: null } as const;

  it('OpenRouter にキー無しでつながったら、接続済みに続けて「API キーなし」と出す', () => {
    useLlmKeysStore.setState({ keyed: [] });
    useLlmProfilesStore.setState({ checks: { cloud: OK } });
    render(<LlmConnectionNotice profileId="cloud" />);
    expect(screen.getByRole('status').textContent).toContain('API キーなし');

    act(() => useLlmKeysStore.setState({ keyed: [OPENROUTER] }));
    expect(screen.getByRole('status').textContent).not.toContain('API キーなし');
  });

  it('クラウドでない接続先には出さない（キーが要らない）', () => {
    useLlmKeysStore.setState({ keyed: [] });
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'p1', baseUrl: 'http://127.0.0.1:11434/v1' })],
      checks: { p1: OK },
    });
    render(<LlmConnectionNotice profileId="p1" />);
    expect(screen.getByRole('status').textContent).not.toContain('API キーなし');
  });
});
