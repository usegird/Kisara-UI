// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useComfyConnect, useComfyConnection } from '@/hooks/comfy/use-comfy-connection';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';
import {
  cloudAgreed,
  comfyRemoteAgreed,
  isAccepted,
  parseAcceptance,
  parseCloudAgreement,
  TERMS_REVISION,
  termsAccepted,
  useTermsStore,
} from '@/store/use-terms-store';

import { acceptTerms } from '../helpers/connection';

// ─────────────────────────────
// 利用規約への同意と、同意するまでつながないこと
// ─────────────────────────────

const ORIGINAL = {
  probe: useConnectionStore.getState().probe,
  load: useDefinitionsStore.getState().load,
};

let probe: ReturnType<typeof vi.fn<(baseUrl: string) => Promise<boolean>>>;

beforeEach(() => {
  probe = vi.fn((_baseUrl: string) => Promise.resolve(true));
  useConnectionStore.setState({ probe, status: 'disconnected' });
  useDefinitionsStore.setState({ load: vi.fn(() => Promise.resolve()) });
  useSettingsStore.setState({ baseUrl: 'http://comfy' });
  useTermsStore.setState({ accepted: null });
});

afterEach(() => {
  cleanup();
  useConnectionStore.setState({ probe: ORIGINAL.probe });
  useDefinitionsStore.setState({ load: ORIGINAL.load });
});

describe('同意の判定', () => {
  it('残した版が今の取り直す版より古ければ、同意していないとみなす', () => {
    const at = '2026-10-15T00:00:00.000Z';
    expect(isAccepted({ revision: TERMS_REVISION, acceptedAt: at })).toBe(true);
    expect(isAccepted({ revision: TERMS_REVISION - 1, acceptedAt: at })).toBe(false);
    expect(isAccepted(null)).toBe(false);
  });

  it('形の合わない値は同意していないとみなす', () => {
    expect(parseAcceptance({ revision: 'x', acceptedAt: 'y' })).toBeNull();
    expect(parseAcceptance({ revision: 1 })).toBeNull();
    expect(parseAcceptance({ revision: 1, acceptedAt: 'y' })).toEqual({
      revision: 1,
      acceptedAt: 'y',
    });
  });

  it('同意すると今の取り直す版と時刻を残す', () => {
    useTermsStore.getState().accept();
    expect(useTermsStore.getState().accepted?.revision).toBe(TERMS_REVISION);
    expect(termsAccepted()).toBe(true);
  });
});

describe('同意するまでつながない', () => {
  it('同意していなければ、押しても接続を確かめに行かない', async () => {
    const { result } = renderHook(() => useComfyConnect());
    await act(() => result.current.connect());
    expect(probe).not.toHaveBeenCalled();
  });

  it('起動時に同意していなければ試さず、同意した時点で 1 回だけ試す', async () => {
    renderHook(() => useComfyConnection());
    await act(() => Promise.resolve());
    expect(probe).not.toHaveBeenCalled();

    await act(() => {
      acceptTerms();
      return Promise.resolve();
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('外部クラウド接続の注意への合意は時刻だけを残し、読めない値は合意していないとみなす', () => {
    useTermsStore.setState({ cloud: null });
    expect(cloudAgreed()).toBe(false);
    useTermsStore.getState().acceptCloud();
    expect(cloudAgreed()).toBe(true);
    expect(parseCloudAgreement({ acceptedAt: '2026-10-21T00:00:00Z' })).toEqual({
      acceptedAt: '2026-10-21T00:00:00Z',
    });
    expect(parseCloudAgreement({ acceptedAt: 1 })).toBeNull();
    useTermsStore.setState({ cloud: null });
  });

  it('Workflow の実行前の確認を行わない注意への合意は、外部クラウドの合意とは別に時刻を残す', () => {
    useTermsStore.setState({ cloud: null, bypass: null });
    useTermsStore.getState().acceptBypass();
    expect(useTermsStore.getState().bypass?.acceptedAt).toBeTypeOf('string');
    expect(cloudAgreed()).toBe(false);
    useTermsStore.setState({ bypass: null });
  });
});

describe('外部の ComfyUI に接続する注意への合意', () => {
  it('合意したら時刻を残す。無ければ合意していない', () => {
    useTermsStore.setState({ comfyRemote: null });
    expect(comfyRemoteAgreed()).toBe(false);
    useTermsStore.getState().acceptComfyRemote();
    expect(comfyRemoteAgreed()).toBe(true);
    expect(useTermsStore.getState().comfyRemote?.acceptedAt).toMatch(/^\d{4}-/);
    useTermsStore.setState({ comfyRemote: null });
  });
});
