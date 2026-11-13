// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebSearchToggle } from '@/components/llm/workspace/WebSearchToggle';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWebSearchStore } from '@/store/use-web-search-store';

import { profile, setDefaultLlm } from '../helpers/llm';

// ─────────────────────────────
// 入力欄の Web のアイコン。初めて有効にするときだけ費用の注意を出して確かめる
// ─────────────────────────────

afterEach(cleanup);

beforeEach(() => {
  useLlmProfilesStore.setState({
    profiles: [profile({ baseUrl: 'https://openrouter.ai/api/v1' })],
  });
  setDefaultLlm();
  useSettingsStore.getState().setWebSearchEngine('parallel:fast');
  useWebSearchStore.setState({ modes: { chat: 'off', advisor: 'off' }, agreed: false });
});

const icon = (): HTMLElement => screen.getByRole('button', { name: /^Web / });
const dialog = (): HTMLElement | null =>
  screen.queryByRole('alertdialog', { name: 'Web 検索を有効にしますか' });

describe('Web のアイコン', () => {
  it('初めて有効にするときは注意を出し、取りやめたら切ったまま、承諾したら有効にする', () => {
    render(<WebSearchToggle scope="chat" />);
    fireEvent.click(icon());
    expect(dialog()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取りやめる' }));
    expect(useWebSearchStore.getState().modes.chat).toBe('off');
    expect(useWebSearchStore.getState().agreed).toBe(false);

    fireEvent.click(icon());
    fireEvent.click(screen.getByRole('button', { name: '有効にする' }));
    expect(useWebSearchStore.getState().modes.chat).toBe('search');
    expect(useWebSearchStore.getState().agreed).toBe(true);
  });

  it('切るときと、承諾した後に有効にするときは確かめない（構成の相談のアイコンも同じ）', () => {
    useWebSearchStore.setState({ modes: { chat: 'search', advisor: 'off' } });
    render(<WebSearchToggle scope="chat" />);
    fireEvent.click(icon());
    expect(dialog()).toBeNull();
    expect(useWebSearchStore.getState().modes.chat).toBe('off');

    useWebSearchStore.getState().agree();
    cleanup();
    render(<WebSearchToggle scope="advisor" />);
    fireEvent.click(icon());
    expect(dialog()).toBeNull();
    expect(useWebSearchStore.getState().modes).toEqual({ chat: 'off', advisor: 'search' });
  });
});
