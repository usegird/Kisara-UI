// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComfyRemoteAgreementRow, TermsFields } from '@/components/ui/terms-dialog';
import { TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

import { acceptTerms } from '../helpers/connection';

beforeEach(() => {
  useTermsStore.setState({ accepted: null, notice: null, cloud: null });
});

afterEach(cleanup);

describe('プライバシーポリシー', () => {
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
    expect(screen.getAllByRole('listitem').map((item) => item.textContent?.slice(0, 6))).toEqual([
      '利用規約20',
      'プライバシー',
      '利用上の注意',
      'アクセシビリ',
    ]);
    expect(
      screen.getByRole('button', { name: '利用上の注意事項' }).closest('li')?.textContent,
    ).toBe('利用上の注意事項未確認');
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
