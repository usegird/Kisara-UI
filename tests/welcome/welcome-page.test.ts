// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lookupEntry } from '@/i18n/catalog-shape';
import en from '@/i18n/locales/en.json';
import ja from '@/i18n/locales/ja.json';
import {
  agreementKeyOf,
  loadAgreement,
  NOTICE_REVISION,
  saveAgreement,
  TERMS_REVISION,
} from '@/store/persist/agreements';
import { fillWelcome } from '@/welcome/fill';
import { moveTo } from '@/welcome/paths';

import { stubMediaQuery } from '../helpers/dom';

vi.mock('@/welcome/paths', async (original) => ({
  ...(await original<typeof import('@/welcome/paths')>()),
  moveTo: vi.fn(),
}));

const ROOT = process.cwd();
const TEMPLATE = readFileSync(join(ROOT, 'index.html'), 'utf8');
const AT = '2026-11-01T00:00:00.000Z';
const CONSENT =
  '18 歳以上かつ居住地の成年年齢以上であり、利用規約とプライバシーポリシーに同意します';

async function openPage(code = 'ja'): Promise<void> {
  const html = fillWelcome(TEMPLATE, {
    message: (key) => {
      const entry = lookupEntry(ja, key) ?? lookupEntry(en, key);
      return typeof entry === 'object' ? entry.other : entry;
    },
    legal: (document) => readFileSync(join(ROOT, 'legal', 'ja', `${document}.txt`), 'utf8'),
    icon: () => '<svg aria-hidden="true"></svg>',
  });
  const inner = /<html[^>]*>([\s\S]*)<\/html>/.exec(html)?.[1] ?? '';
  document.documentElement.lang = code;
  document.documentElement.innerHTML = inner;
  vi.resetModules();
  await import('@/welcome/main');
}

function byLabel<T extends HTMLElement>(text: string): T {
  const found = [...document.querySelectorAll<HTMLElement>('input')].find(
    (input) =>
      input.getAttribute('aria-label') === text ||
      input.closest('label')?.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`無い: ${text}`);
  return found as T;
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
  if (found === undefined) throw new Error(`無い: ${text}`);
  return found;
}

function dialog(id: string): HTMLDialogElement {
  return document.getElementById(id) as HTMLDialogElement;
}

beforeEach(() => {
  stubMediaQuery('(prefers-color-scheme: dark)', false);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(() => {
  localStorage.clear();
  vi.mocked(moveTo).mockClear();
});

describe('はじめの画面の文言', () => {
  it('言語の文言で埋め、文の中の文書の名前を、その文書を開くリンクにする', async () => {
    await openPage();
    expect(document.querySelector('h1')?.textContent).toBe('KisaraUI');
    const terms = button('利用規約');
    expect(terms.parentElement?.textContent).toBe(
      '利用規約とプライバシーポリシーをご確認ください。',
    );
    expect(button('プライバシーポリシー').parentElement).toBe(terms.parentElement);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(
      /^KisaraUI は/,
    );
  });

  it('規約の本文の URL を新しいタブで開くリンクにし、版と日付を実行時に埋める', async () => {
    await openPage();
    const policy = dialog('privacy-view');
    const link = policy.querySelector('a[href="https://contact.kisara-ui.com"]');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(dialog('terms-view').textContent).toContain(`版 ${String(TERMS_REVISION)}・`);
  });

  it('ロゴと背景の絵は飾りとして読み上げない', async () => {
    await openPage();
    const images = [...document.querySelectorAll('img')].map((image) => image.alt);
    expect(images).toEqual(['', '']);
  });
});

describe('同意の段', () => {
  it('注意事項の確認と同意の印の両方を入れるまで始められず、押すと同意を残して本体へ移る', async () => {
    await openPage();
    const start = button('同意して始める');
    expect(start.disabled).toBe(true);
    byLabel<HTMLInputElement>(CONSENT).click();
    expect(start.disabled).toBe(true);
    byLabel<HTMLInputElement>('利用上の注意事項を確認しました').click();
    expect(dialog('usage-notice-view').open).toBe(true);
    button('確認した').click();
    expect(start.disabled).toBe(false);
    start.click();
    expect(loadAgreement('terms')).toMatchObject({ revision: TERMS_REVISION });
    expect(moveTo).toHaveBeenCalledWith('/app/', 'push');
  });

  it('注意事項の印を押しても入らず、閉じるでは残さない。「確認した」で入って外せなくなる', async () => {
    await openPage();
    const box = byLabel<HTMLInputElement>('利用上の注意事項を確認しました');
    box.click();
    expect(box.checked).toBe(false);
    dialog('usage-notice-view').close();
    expect(loadAgreement('notice')).toBeNull();
    button('利用上の注意事項').click();
    button('確認した').click();
    expect([box.checked, box.disabled]).toEqual([true, true]);
    expect(loadAgreement('notice')).toMatchObject({ revision: NOTICE_REVISION });
  });

  it('確認済みなら、注意事項は「確認した」の無い読むだけのポップアップになる', async () => {
    saveAgreement('notice', { revision: NOTICE_REVISION, acceptedAt: AT });
    await openPage();
    expect(button('確認した').hidden).toBe(true);
  });

  it('前の版に同意していたなら改定の要約を出し、今の版に同意済みなら印を入れたまま押せなくする', async () => {
    saveAgreement('terms', { revision: TERMS_REVISION - 1, acceptedAt: AT });
    await openPage();
    const revised = document.querySelector<HTMLElement>('[data-revised]');
    expect(revised?.hidden).toBe(false);
    expect(revised?.textContent).toMatch(/から新しい規約が適用されます/);

    saveAgreement('terms', { revision: TERMS_REVISION, acceptedAt: AT });
    await openPage();
    const consent = byLabel<HTMLInputElement>(CONSENT);
    expect([consent.checked, consent.disabled]).toEqual([true, true]);
  });

  it('同意を書いても、ほかの規約の鍵は消さない', async () => {
    saveAgreement('cloud', { acceptedAt: AT });
    saveAgreement('notice', { revision: NOTICE_REVISION, acceptedAt: AT });
    await openPage();
    byLabel<HTMLInputElement>(CONSENT).click();
    button('同意して始める').click();
    expect(localStorage.getItem(agreementKeyOf('cloud'))).toContain(AT);
  });
});

describe('ポップアップと言語', () => {
  it('システム構成のリンクから、ローカル端末の枠を持つ経路の図を開き、× で閉じる', async () => {
    await openPage();
    button('システム構成').click();
    const system = dialog('welcome-system');
    expect(system.open).toBe(true);
    expect(system.querySelector('[role="group"]')?.textContent).toContain('ローカル端末');
    system.querySelector<HTMLButtonElement>('[data-close]')?.click();
    expect(system.open).toBe(false);
  });

  it('根の頁は残した言語の頁へ移し、言語の頁を名指しで開いたときは移さない', async () => {
    localStorage.setItem('kisaraui.locale', 'ja');
    await openPage('en');
    expect(moveTo).toHaveBeenCalledWith('/ja/', 'replace');
    vi.mocked(moveTo).mockClear();
    localStorage.setItem('kisaraui.locale', 'en');
    await openPage('ja');
    expect(moveTo).not.toHaveBeenCalled();
  });
});
