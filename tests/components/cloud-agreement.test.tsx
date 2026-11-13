// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmEndpointField } from '@/components/llm/side-panel/LlmEndpointField';
import { installLlmPort } from '@/store/ports/llm-port';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useTermsStore } from '@/store/use-terms-store';

import { fakeLlmPort, profile } from '../helpers/llm';

// ─────────────────────────────
// 外部クラウド接続の注意への合意。初めてつなぐ前に確かめ、同意したら日時を残してつなぐ。
// やめたらつながない。つないだ後は注意を出さない
// ─────────────────────────────

const OPENROUTER = 'https://openrouter.ai/api/v1';

beforeEach(() => {
  installLlmPort(fakeLlmPort());
  useTermsStore.setState({ cloud: null });
  useLlmProfilesStore.setState({
    profiles: [profile({ id: 'p1', baseUrl: OPENROUTER })],
    checks: {},
  });
});

afterEach(() => {
  cleanup();
  useTermsStore.setState({ cloud: null });
});

function renderField(): void {
  render(<LlmEndpointField profileId="p1" onProfile={() => undefined} />);
}

describe('外部クラウド接続の注意', () => {
  it('やめたらつながず、合意も残さない', () => {
    renderField();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    expect(screen.getByRole('alertdialog', { name: '外部クラウド接続の注意' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(useLlmProfilesStore.getState().checks.p1).toBeUndefined();
    expect(useTermsStore.getState().cloud).toBeNull();
  });

  it('同意したら日時を残してつなぐ。つないだ後は注意を出さない', async () => {
    renderField();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    fireEvent.click(screen.getByRole('button', { name: '同意して接続' }));
    expect(useTermsStore.getState().cloud?.acceptedAt).toMatch(/^\d{4}-/);
    await waitFor(() => expect(useLlmProfilesStore.getState().checks.p1?.kind).toBe('ok'));
    expect(screen.queryByText(/外部のクラウドサービスに接続します/)).toBeNull();
  });

  it('OpenRouter 以外でも、私的なアドレスの外なら注意を出す', () => {
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'p1', baseUrl: 'https://api.together.xyz/v1' })],
      checks: {},
    });
    renderField();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    expect(screen.getByRole('alertdialog', { name: '外部クラウド接続の注意' })).toBeTruthy();
  });

  it('合意済みなら確かめずにつなぐ', async () => {
    useTermsStore.getState().acceptCloud();
    renderField();
    fireEvent.click(screen.getByRole('button', { name: '接続' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(useLlmProfilesStore.getState().checks.p1?.kind).toBe('ok'));
  });
});
