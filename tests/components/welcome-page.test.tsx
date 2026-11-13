// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { WelcomePage } from '@/components/app/WelcomePage';
import { comfyLanding } from '@/components/comfy/landing';
import { llmLanding } from '@/components/llm/landing';
import { termsAccepted, useTermsStore } from '@/store/use-terms-store';

import { acceptTerms } from '../helpers/connection';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// はじめの画面。同意する前は外枠の代わりに出し、同意した後は `#welcome` で
// 外枠を組んだまま上に重ねる。ロゴは読み上げない
// ─────────────────────────────

// 外枠は中身を問わない（組んだまま残るかだけを見る）
vi.mock('@/components/app/AppShell', () => ({
  AppShell: () => <p>外枠</p>,
}));

// 根（App）と同じ種別の札を渡す
const LANDINGS = [llmLanding, comfyLanding];

function goTo(hash: string): void {
  act(() => {
    window.history.replaceState(null, '', `/${hash}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  useTermsStore.setState({ accepted: null, notice: null, cloud: null });
  window.history.replaceState(null, '', '/');
});

afterEach(cleanup);

describe('はじめの画面', () => {
  it('名前を見出しで出して焦点を移し、ロゴと背景の絵は飾りとして読み上げない', () => {
    render(<WelcomePage landings={LANDINGS} />);
    const title = screen.getByRole('heading', { level: 1, name: 'KisaraUI' });
    expect(document.activeElement).toBe(title);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'これはなに？',
      'できること',
      '特長',
    ]);
  });

  it('注意事項を確認し、印を入れて同意して始めると、同意を残す', () => {
    render(<WelcomePage landings={LANDINGS} />);
    const start = screen.getByRole<HTMLButtonElement>('button', { name: '同意して始める' });
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '利用上の注意事項を確認しました' }));
    fireEvent.click(screen.getByRole('button', { name: '確認した' }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '18 歳以上かつ居住地の成年年齢以上であり、利用規約とプライバシーポリシーに同意します',
      }),
    );
    fireEvent.click(start);
    expect(termsAccepted()).toBe(true);
  });
});

describe('システム構成', () => {
  it('プライバシーの説明の末尾のリンクから、ローカル端末の枠を持つ経路の図を開く', () => {
    render(<WelcomePage landings={LANDINGS} />);
    const link = screen.getByRole('button', { name: 'システム構成' });
    // 括弧は文言の側が持ち、リンクは名前だけ
    expect(link.parentElement?.textContent).toBe('（システム構成）');
    fireEvent.click(link);
    const dialog = screen.getByRole('dialog', { name: 'システム構成' });
    expect(within(dialog).getByRole('group', { name: 'ローカル端末' })).toBeTruthy();
    expect(within(dialog).getByText(/^このページの配信元（/)).toBeTruthy();
  });
});

describe('漏れ', () => {
  it('システム構成を開いて閉じるのを繰り返しても、閉じた中身を残さない', async () => {
    const leak = leakWatch();
    render(<WelcomePage landings={LANDINGS} />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'システム構成' }));
      leak.watch(await screen.findByRole('dialog', { name: 'システム構成' }));
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('出し分け', () => {
  it('同意する前は外枠を組まず、同意して始めると外枠に替わる', () => {
    render(<App />);
    expect(screen.queryByText('外枠')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '利用上の注意事項を確認しました' }));
    fireEvent.click(screen.getByRole('button', { name: '確認した' }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '18 歳以上かつ居住地の成年年齢以上であり、利用規約とプライバシーポリシーに同意します',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '同意して始める' }));
    expect(screen.getByText('外枠').closest('[inert]')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'KisaraUI' })).toBeNull();
  });

  it('同意した後は #welcome で外枠の上に重ね、印を入れたまま押せなくし、同意して始めると閉じる', () => {
    acceptTerms();
    const before = useTermsStore.getState().accepted;
    render(<App />);
    goTo('#welcome');
    expect(screen.getByText('外枠').closest('[inert]')).not.toBeNull();
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: '18 歳以上かつ居住地の成年年齢以上であり、利用規約とプライバシーポリシーに同意します',
    });
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '同意して始める' }));
    expect(window.location.hash).toBe('');
    expect(useTermsStore.getState().accepted).toBe(before);
    expect(screen.queryByRole('heading', { name: 'KisaraUI' })).toBeNull();
    expect(screen.getByText('外枠').closest('[inert]')).toBeNull();
  });
});
