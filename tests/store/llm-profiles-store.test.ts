// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isCloudService } from '@/chat/cloud-service';
import { installLlmPort } from '@/store/ports/llm-port';
import { useLlmKeysStore } from '@/store/use-llm-keys-store';
import {
  contextLengthOf,
  loadProfiles,
  saveProfiles,
  useLlmProfilesStore,
} from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';

import { fakeLlmPort, profile } from '../helpers/llm';

// ─────────────────────────────
// 接続の設定の置き場。API キーは持たない（ゲートウェイが持つ）。
// ─────────────────────────────

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const base = { baseUrl: 'http://x/v1', defaultModel: 'm' };

describe('接続の設定の置き場', () => {
  it('キーが要るかを残す', () => {
    saveProfiles([{ ...base, id: 'a', keyRequired: true }]);
    expect(loadProfiles()[0]).toMatchObject({ id: 'a', keyRequired: true });
  });

  it('このタブで直した 1 件だけを書き、ほかのタブが足した設定を消さない', () => {
    const mine = profile({ id: 'a', baseUrl: 'http://a/v1' });
    useLlmProfilesStore.setState({ profiles: [mine] });
    saveProfiles([mine]);
    // ほかのタブが 1 件足した
    saveProfiles([mine, profile({ id: 'b', baseUrl: 'http://b/v1' })]);

    useLlmProfilesStore.getState().update('a', { defaultModel: 'changed' });

    const ids = loadProfiles().map((item) => `${item.id}:${item.defaultModel}`);
    expect(ids).toEqual(['a:changed', `b:${profile({}).defaultModel}`]);
  });
});

describe('つながったときだけ残す', () => {
  it('足した設定は、つながるまで端末に書かず、つながったら書く', async () => {
    installLlmPort(fakeLlmPort(['m']));
    useLlmProfilesStore.setState({ profiles: [], checks: {} });
    const id = useLlmProfilesStore.getState().add();
    useLlmProfilesStore.getState().update(id, { baseUrl: 'http://typo/v1' });
    expect(loadProfiles()).toEqual([]);

    await useLlmProfilesStore.getState().check(id);
    expect(loadProfiles().map((item) => item.baseUrl)).toEqual(['http://typo/v1']);
  });

  it('履歴の × で、同じ URL の設定も消す。選んでいる設定は残す', () => {
    const a = profile({ id: 'a', baseUrl: 'http://x/v1' });
    const b = profile({ id: 'b', baseUrl: 'http://x/v1/' });
    useLlmProfilesStore.setState({ profiles: [a, b] });

    useLlmProfilesStore.getState().forgetUrl('http://x/v1', 'b');
    expect(useLlmProfilesStore.getState().profiles.map((item) => item.id)).toEqual(['b']);
  });
});

describe('開いた直後の自動の接続', () => {
  it('キーが要るのにまだ入っていない設定には、自動でつながない', async () => {
    const port = fakeLlmPort(['m']);
    const listModels = vi.spyOn(port, 'listModels');
    installLlmPort(port);
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'needs', keyRequired: true })],
      checks: {},
    });
    useLlmProfilesStore.getState().autoCheck('needs');
    await Promise.resolve();
    expect(listModels).not.toHaveBeenCalled();
  });
});

describe('モデルの文脈長', () => {
  const ok = (serverContext: number | null) =>
    ({ kind: 'ok', models: ['m'], contexts: { m: 8192 }, details: {}, serverContext }) as const;

  it('サーバーの起動時の文脈長を一覧の値より先に使い、わからなければ null', () => {
    expect(contextLengthOf(ok(4096), 'm')).toBe(4096);
    expect(contextLengthOf(ok(null), 'm')).toBe(8192);
    expect(contextLengthOf(ok(null), 'other')).toBeNull();
    expect(contextLengthOf({ kind: 'checking' }, 'm')).toBeNull();
    expect(contextLengthOf(undefined, 'm')).toBeNull();
  });
});

describe('ベース URL の履歴', () => {
  it('つながった URL だけを残し、最後につないだものを先頭にする', async () => {
    useSettingsStore.setState({ llmUrlHistory: [] });
    useLlmProfilesStore.setState({
      profiles: [
        profile({ id: 'a', baseUrl: 'http://a/v1' }),
        profile({ id: 'b', baseUrl: 'http://b/v1' }),
      ],
      checks: {},
    });
    const port = fakeLlmPort(['m']);
    installLlmPort(port);
    await useLlmProfilesStore.getState().check('a');
    await useLlmProfilesStore.getState().check('b');
    await useLlmProfilesStore.getState().check('a');
    expect(useSettingsStore.getState().llmUrlHistory).toEqual(['http://a/v1', 'http://b/v1']);

    installLlmPort({
      ...port,
      listModels: () => Promise.resolve({ ok: false, failure: { kind: 'unreachable' } }),
    });
    useLlmProfilesStore.getState().update('b', { baseUrl: 'http://c/v1' });
    await useLlmProfilesStore.getState().check('b');
    expect(useSettingsStore.getState().llmUrlHistory).toEqual(['http://a/v1', 'http://b/v1']);
  });
});

describe('OpenRouter の API キーの確かめ', () => {
  const OPENROUTER = 'https://openrouter.ai/api/v1';
  const denied = () => Promise.resolve({ ok: false as const, failure: { kind: 'auth' as const } });

  it('キーを入れたときだけ確かめ、断られたら一覧が取れても認証の失敗にする', async () => {
    useTermsStore.getState().acceptCloud();
    let keyChecks = 0;
    installLlmPort({
      ...fakeLlmPort(['m']),
      checkKey: () => {
        keyChecks += 1;
        return denied();
      },
    });
    const LOCAL = 'http://127.0.0.1:11434/v1';
    useLlmProfilesStore.setState({
      profiles: [
        profile({ id: 'cloud', baseUrl: OPENROUTER }),
        profile({ id: 'local', baseUrl: LOCAL }),
      ],
      checks: {},
    });
    useLlmKeysStore.setState({ keyed: [] });
    await useLlmProfilesStore.getState().check('cloud');
    expect(useLlmProfilesStore.getState().checks.cloud?.kind).toBe('ok');

    useLlmKeysStore.setState({ keyed: [OPENROUTER, LOCAL] });
    await useLlmProfilesStore.getState().check('cloud');
    await useLlmProfilesStore.getState().check('local');
    const checks = useLlmProfilesStore.getState().checks;
    expect(checks.cloud).toMatchObject({ kind: 'failed', failure: { kind: 'auth' } });
    expect(checks.local?.kind).toBe('ok');
    expect(keyChecks).toBe(1);
    useLlmKeysStore.setState({ keyed: [] });
  });

  it('確かめが届かないなどの失敗なら、一覧が取れていればつながったままにする', async () => {
    useTermsStore.getState().acceptCloud();
    installLlmPort({
      ...fakeLlmPort(['m']),
      checkKey: () => Promise.resolve({ ok: false, failure: { kind: 'unreachable' } }),
    });
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'c', baseUrl: OPENROUTER })],
      checks: {},
    });
    useLlmKeysStore.setState({ keyed: [OPENROUTER] });
    await useLlmProfilesStore.getState().check('c');
    expect(useLlmProfilesStore.getState().checks.c?.kind).toBe('ok');
    useLlmKeysStore.setState({ keyed: [] });
  });
});

describe('入力の窓で入ったキーを確かめる', () => {
  const OPENROUTER = 'https://openrouter.ai/api/v1';

  it('断られたら auth、同じベース URL の設定の接続の状況も替える', async () => {
    useTermsStore.getState().acceptCloud();
    installLlmPort({
      ...fakeLlmPort(['m']),
      checkKey: () => Promise.resolve({ ok: false, failure: { kind: 'auth' } }),
    });
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'c', baseUrl: OPENROUTER })],
      checks: {},
    });
    useLlmKeysStore.setState({ keyed: [OPENROUTER] });
    expect(await useLlmProfilesStore.getState().verifyKey(`${OPENROUTER}/`)).toBe('auth');
    expect(useLlmProfilesStore.getState().checks.c?.kind).toBe('failed');
    useLlmKeysStore.setState({ keyed: [] });
  });

  it('設定が無い先も確かめ、一覧が取れれば ok、届かなければ failed', async () => {
    useLlmProfilesStore.setState({ profiles: [], checks: {} });
    installLlmPort(fakeLlmPort(['m']));
    expect(await useLlmProfilesStore.getState().verifyKey('http://x/v1')).toBe('ok');
    installLlmPort({
      ...fakeLlmPort(['m']),
      listModels: () => Promise.resolve({ ok: false, failure: { kind: 'unreachable' } }),
    });
    expect(await useLlmProfilesStore.getState().verifyKey('http://x/v1')).toBe('failed');
    expect(useLlmProfilesStore.getState().checks).toEqual({});
  });
});

describe('外部のクラウドのサービス', () => {
  it('OpenRouter のベース URL だけをクラウドとみなす（読めない URL は違う）', () => {
    expect(isCloudService('https://openrouter.ai/api/v1')).toBe(true);
    expect(isCloudService(' https://api.openrouter.ai/v1 ')).toBe(true);
    expect(isCloudService('http://127.0.0.1:11434/v1')).toBe(false);
    expect(isCloudService('https://notopenrouter.ai/v1')).toBe(false);
    expect(isCloudService('')).toBe(false);
  });

  it('注意に合意するまでは、外部のクラウドに自動でつながない（合意したらつなぐ）', async () => {
    installLlmPort(fakeLlmPort());
    useTermsStore.setState({ cloud: null });
    useLlmProfilesStore.setState({
      profiles: [
        profile({ id: 'cloud', baseUrl: 'https://openrouter.ai/api/v1' }),
        profile({ id: 'local', baseUrl: 'http://127.0.0.1:11434/v1' }),
      ],
      checks: {},
    });
    useLlmProfilesStore.getState().autoCheck('cloud');
    useLlmProfilesStore.getState().autoCheck('local');
    expect(useLlmProfilesStore.getState().checks.cloud).toBeUndefined();
    expect(useLlmProfilesStore.getState().checks.local).toBeDefined();
    useTermsStore.getState().acceptCloud();
    await useLlmProfilesStore.getState().check('cloud');
    expect(useLlmProfilesStore.getState().checks.cloud?.kind).toBe('ok');
    useTermsStore.setState({ cloud: null });
  });
});
