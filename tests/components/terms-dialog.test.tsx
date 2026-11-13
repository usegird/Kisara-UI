// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComfyRemoteAgreementRow, TermsConsent, TermsFields } from '@/components/ui/terms-dialog';
import {
  NOTICE_REVISION,
  TERMS_REVISION,
  termsAccepted,
  useTermsStore,
} from '@/store/use-terms-store';

import { acceptTerms } from '../helpers/connection';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

// ─────────────────────────────
// 利用規約への同意の段と、設定のタブの行
// ─────────────────────────────

beforeEach(() => {
  useTermsStore.setState({ accepted: null, notice: null, cloud: null });
});

/** 利用上の注意事項を開いて「確認した」を押す */
function acknowledgeNotice(): void {
  fireEvent.click(screen.getByRole('checkbox', { name: '利用上の注意事項を確認しました' }));
  fireEvent.click(screen.getByRole('button', { name: '確認した' }));
}

afterEach(cleanup);

describe('同意の段', () => {
  it('注意事項の確認と同意の印の両方を入れるまで始められず、入れて押すと同意を残す', () => {
    const onStart = vi.fn();
    render(<TermsConsent onStart={onStart} />);
    const start = screen.getByRole<HTMLButtonElement>('button', { name: '同意して始める' });
    expect(start.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '18 歳以上かつ居住地の成年年齢以上であり、利用規約とプライバシーポリシーに同意します',
      }),
    );
    expect(start.disabled).toBe(true);
    acknowledgeNotice();
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(termsAccepted()).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('前の版に同意していたなら、改定の要約を出す', () => {
    useTermsStore.setState({
      accepted: { revision: TERMS_REVISION - 1, acceptedAt: '2026-01-01T00:00:00.000Z' },
    });
    render(<TermsConsent />);
    expect(screen.getByText(/から新しい規約が適用されます/)).toBeTruthy();
    // 改定の要約の下にも、文書を開くリンクの入った一言を出す
    expect(screen.getByRole('button', { name: '利用規約' })).toBeTruthy();
  });

  it('注意事項の印を押すとポップアップが開き、仕組みの段落・使用上の注意・AI の出力を出す。閉じるでは印が入らない', () => {
    render(<TermsConsent />);
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: '利用上の注意事項を確認しました',
    });
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    const dialog = screen.getByRole('dialog', { name: '利用上の注意事項' });
    expect(dialog.textContent).toContain('処理は利用者のブラウザの中（ローカル）で行われます');
    expect(dialog.textContent).toContain(
      '接続先で生じる料金等は利用者の負担であり、当方が補填することはありません（第8条）。',
    );
    expect(dialog.textContent).toContain('正確な内容は利用規約によります。');
    expect(dialog.textContent).toContain('使用上の注意（利用規約から抜粋）');
    expect(dialog.textContent).toContain('AI の出力について');
    const items = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent?.slice(0, 6).trimEnd());
    expect(items).toEqual([
      '故障や高額請',
      '1 回の操作',
      '本ツールで作',
      '事業者によっ',
      '当方の公式の',
      'AI は間違',
      '出力内容は参',
      '現代の AI',
    ]);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(box.checked).toBe(false);
    expect(useTermsStore.getState().notice).toBeNull();
  });

  it('「確認した」を押すと印が入って外せなくなり、版と時刻を残す。名前のリンクからも開ける', () => {
    render(<TermsConsent />);
    fireEvent.click(screen.getByRole('button', { name: '利用上の注意事項' }));
    fireEvent.click(screen.getByRole('button', { name: '確認した' }));
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: '利用上の注意事項を確認しました',
    });
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
    expect(useTermsStore.getState().notice).toMatchObject({ revision: NOTICE_REVISION });
    expect(useTermsStore.getState().notice?.acceptedAt).toMatch(/^\d{4}-/);
  });

  it('確認済みなら、名前のリンクは「確認した」の無い読むだけのダイアログを開く', async () => {
    useTermsStore.setState({
      notice: { revision: NOTICE_REVISION, acceptedAt: '2026-10-31T00:00:00.000Z' },
    });
    render(<TermsConsent />);
    fireEvent.click(screen.getByRole('button', { name: '利用上の注意事項' }));
    const view = await screen.findByRole('dialog', { name: '利用上の注意事項' });
    expect(view.textContent).toContain('使用上の注意（利用規約から抜粋）');
    expect(screen.queryByRole('button', { name: '確認した' })).toBeNull();
  });

  it('古い版の注意事項しか確認していなければ、印は入っていない', () => {
    useTermsStore.setState({
      notice: { revision: NOTICE_REVISION - 1, acceptedAt: '2026-01-01T00:00:00.000Z' },
    });
    render(<TermsConsent />);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: '利用上の注意事項を確認しました' })
        .checked,
    ).toBe(false);
  });

  it('確認を求める一言の、文書の名前の所がその文書を開くリンクになる', () => {
    render(<TermsConsent />);
    const terms = screen.getByRole('button', { name: '利用規約' });
    expect(terms.parentElement?.textContent).toBe(
      '利用規約とプライバシーポリシーをご確認ください。',
    );
    expect(screen.getByRole('button', { name: 'プライバシーポリシー' }).parentElement).toBe(
      terms.parentElement,
    );
  });
});

describe('プライバシーポリシー', () => {
  it('同意の段から開き、閉じても同意は残さない', async () => {
    render(<TermsConsent />);
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }));
    const policy = await screen.findByRole('dialog', { name: 'プライバシーポリシー' });
    expect(policy.textContent).toContain('個人情報を集める仕組みを置きません');
    fireEvent.keyDown(policy, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(termsAccepted()).toBe(false);
  });

  it('設定の行から開ける', async () => {
    acceptTerms();
    render(<TermsFields />);
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }));
    expect(await screen.findByRole('dialog', { name: 'プライバシーポリシー' })).toBeTruthy();
  });

  it('本文の問い合わせフォームの URL を、新しいタブで開くリンクにする（括弧は含めない）', async () => {
    acceptTerms();
    render(<TermsFields />);
    fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }));
    const policy = await screen.findByRole('dialog', { name: 'プライバシーポリシー' });
    const link = within(policy).getByRole('link', { name: 'https://contact.kisara-ui.com' });
    expect(link.getAttribute('href')).toBe('https://contact.kisara-ui.com');
    expect([link.getAttribute('target'), link.getAttribute('rel')]).toEqual([
      '_blank',
      'noopener noreferrer',
    ]);
  });
});

describe('設定の行（利用規約・補足情報）', () => {
  it('見出しは「利用規約・補足情報」で、利用規約の名前のリンクに日時と「確認済」を添える。取り消すボタンは無い', () => {
    useTermsStore.setState({
      accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-20T03:04:00.000Z' },
    });
    render(<TermsFields />);
    expect(screen.getByText('利用規約・補足情報')).toBeTruthy();
    const row = screen.getByRole('button', { name: '利用規約' }).closest('li');
    expect(row?.textContent).toMatch(/^利用規約2026.* 確認済$/);
    expect(screen.queryByRole('button', { name: '同意を取り消す' })).toBeNull();
    // 利用規約・プライバシーポリシーの順に並べ、読むだけのアクセシビリティ方針を最後に置く
    expect(screen.getAllByRole('listitem').map((item) => item.textContent?.slice(0, 6))).toEqual([
      '利用規約20',
      'プライバシー',
      '利用上の注意',
      'アクセシビリ',
    ]);
    // 注意事項は確認の記録。まだなら「未確認」
    expect(
      screen.getByRole('button', { name: '利用上の注意事項' }).closest('li')?.textContent,
    ).toBe('利用上の注意事項未確認');
    // プライバシーポリシーは同じ同意の印で取るので、同じ日時
    const privacy = screen.getByRole('button', { name: 'プライバシーポリシー' }).closest('li');
    expect(privacy?.textContent).toMatch(/^プライバシーポリシー2026.* 確認済$/);
  });

  it('利用規約の名前を押すと全文を開く。まだなら「未確認」', async () => {
    render(<TermsFields />);
    expect(screen.getByRole('button', { name: '利用規約' }).closest('li')?.textContent).toBe(
      '利用規約未確認',
    );
    fireEvent.click(screen.getByRole('button', { name: '利用規約' }));
    expect(await screen.findByRole('dialog', { name: '利用規約' })).toBeTruthy();
  });
});

describe('漏れ', () => {
  it('同意の段からプライバシーポリシーを開いて閉じるのを繰り返しても、閉じた中身を残さない', async () => {
    const leak = leakWatch();
    render(<TermsConsent />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }));
      const policy = await screen.findByRole('dialog', { name: 'プライバシーポリシー' });
      leak.watch(policy);
      fireEvent.keyDown(policy, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('漏れ（利用上の注意事項）', () => {
  it('同意の段から注意事項を開いて閉じるのを繰り返しても、閉じた中身を残さない', async () => {
    const leak = leakWatch();
    render(<TermsConsent />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: '利用上の注意事項' }));
      const dialog = await screen.findByRole('dialog', { name: '利用上の注意事項' });
      leak.watch(dialog);
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});

describe('全文のダイアログ', () => {
  it.each([
    '利用規約',
    'プライバシーポリシー',
    '利用上の注意事項',
    '外部の ComfyUI に接続する注意',
    'アクセシビリティ方針',
  ])('%s は共通の枠で開き、大きさを変える掴みと、焦点を受ける本文を持つ', async (name) => {
    acceptTerms();
    render(
      <TermsFields>
        <ComfyRemoteAgreementRow />
      </TermsFields>,
    );
    fireEvent.click(screen.getByRole('button', { name }));
    const dialog = await screen.findByRole('dialog', { name });
    expect(dialog.querySelectorAll('[data-edge]').length).toBeGreaterThan(0);
    expect(within(dialog).getByRole('region', { name }).tabIndex).toBe(0);
  });
});

describe('アクセシビリティ方針', () => {
  it('合意を取らないので日時を添えず、名前を押すと全文を開いて対応度を「配慮」と示す', async () => {
    acceptTerms();
    render(<TermsFields />);
    const link = screen.getByRole('button', { name: 'アクセシビリティ方針' });
    expect(link.closest('li')?.textContent).toBe('アクセシビリティ方針');
    fireEvent.click(link);
    const statement = await screen.findByRole('dialog', { name: 'アクセシビリティ方針' });
    expect(statement.textContent).toContain('AA（WCAG 2.1 の AA）に配慮します');
    expect(statement.textContent).toContain('2026-11-01 作成');
    fireEvent.keyDown(statement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
