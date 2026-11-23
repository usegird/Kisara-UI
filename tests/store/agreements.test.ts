// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  agreementKeyOf,
  isAgreementKey,
  loadAgreement,
  saveAgreement,
  TERMS_REVISION,
} from '@/store/persist/agreements';
import { knownKeyOf } from '@/store/persist/storage-usage';
import { useTermsStore } from '@/store/use-terms-store';

const AT = '2026-11-23T00:00:00.000Z';

afterEach(() => {
  localStorage.clear();
});

describe('規約ごとの鍵', () => {
  it('ある規約を書いても、ほかの規約の鍵は変わらない', () => {
    saveAgreement('cloud', { acceptedAt: AT });
    const before = localStorage.getItem(agreementKeyOf('cloud'));
    useTermsStore.getState().accept();
    expect(localStorage.getItem(agreementKeyOf('cloud'))).toBe(before);
    expect(loadAgreement('terms')).toMatchObject({ revision: TERMS_REVISION });
  });

  it('一覧は鍵の頭で見分け、保存の管理では合意として名前を付ける', () => {
    saveAgreement('terms', { revision: TERMS_REVISION, acceptedAt: AT });
    saveAgreement('bypass', { acceptedAt: AT });
    localStorage.setItem('kisaraui.settings', '{}');
    const keys = Object.keys(localStorage).filter(isAgreementKey).sort();
    expect(keys).toEqual([agreementKeyOf('bypass'), agreementKeyOf('terms')]);
    expect(knownKeyOf(agreementKeyOf('bypass'))).toBe('terms');
  });

  it('JSON でない値は合意していないとみなす', () => {
    localStorage.setItem(agreementKeyOf('notice'), '{');
    expect(loadAgreement('notice')).toBeNull();
  });

  it('別のタブで書かれた合意を取り込み、ほかの鍵の知らせでは読み直さない', () => {
    useTermsStore.setState({ accepted: null, cloud: null });
    localStorage.setItem(agreementKeyOf('cloud'), JSON.stringify({ acceptedAt: AT }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'kisaraui.settings' }));
    expect(useTermsStore.getState().cloud).toBeNull();
    window.dispatchEvent(new StorageEvent('storage', { key: agreementKeyOf('cloud') }));
    expect(useTermsStore.getState().cloud?.acceptedAt).toBe(AT);
  });
});
