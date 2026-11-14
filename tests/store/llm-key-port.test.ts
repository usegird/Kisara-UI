// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type { LlmKeyPort } from '@/port/llm-port';
import { installLlmKeyPort } from '@/store/ports/llm-key-port';
import { installLlmPort } from '@/store/ports/llm-port';
import { isKeyMissing, useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

import { fakeKeyPort, fakeLlmPort, profile } from '../helpers/llm';

// ─────────────────────────────
// ゲートウェイの窓口の受け口。キーが入ったら確かめて、結果を返す。
// ─────────────────────────────

describe('キーが入ったとき', () => {
  it('確かめた結果を、そのベース URL と一緒にゲートウェイへ返す', async () => {
    installLlmPort(fakeLlmPort(['m']));
    useLlmProfilesStore.setState({ profiles: [], checks: {} });
    let keySet: (baseUrl: string) => void = () => undefined;
    const reportVerified = vi.fn<LlmKeyPort['reportVerified']>();
    installLlmKeyPort(
      fakeKeyPort({
        onKeySet: (listener) => {
          keySet = listener;
          return () => undefined;
        },
        reportVerified,
      }),
    );
    keySet('http://x/v1');
    await vi.waitFor(() => expect(reportVerified).toHaveBeenCalledWith('http://x/v1', 'ok'));
  });
});

describe('キーが要るのに無いか', () => {
  const OPENROUTER = 'https://openrouter.ai/api/v1';
  const LOCAL = 'http://127.0.0.1:8080/v1';

  it('キーが要る設定か OpenRouter でキーが無いとき、またはキーが断られたとき', () => {
    expect(isKeyMissing({ baseUrl: LOCAL, keyRequired: false }, [], false)).toBe(false);
    expect(isKeyMissing({ baseUrl: LOCAL, keyRequired: true }, [], false)).toBe(true);
    expect(isKeyMissing({ baseUrl: LOCAL, keyRequired: true }, [LOCAL], false)).toBe(false);
    expect(isKeyMissing({ baseUrl: OPENROUTER, keyRequired: false }, [], false)).toBe(true);
    expect(isKeyMissing({ baseUrl: LOCAL, keyRequired: false }, [LOCAL], true)).toBe(true);
    expect(isKeyMissing({ baseUrl: ' ', keyRequired: true }, [], true)).toBe(false);
  });
});

describe('読み込み直した直後', () => {
  it('キーが無くて自動でつなぐのを見送った設定は、ゲートウェイがキーを戻したら 1 回つなぐ', async () => {
    const LOCAL = 'http://127.0.0.1:8080/v1';
    const port = fakeLlmPort(['m']);
    const listModels = vi.spyOn(port, 'listModels');
    installLlmPort(port);
    useLlmProfilesStore.setState({
      profiles: [profile({ id: 'k', baseUrl: LOCAL, keyRequired: true })],
      checks: {},
    });
    useLlmKeysStore.setState({ keyed: [] });
    useLlmProfilesStore.getState().autoCheck('k');
    expect(listModels).not.toHaveBeenCalled();

    let keyed: readonly string[] = [];
    let changed: () => void = () => undefined;
    installLlmKeyPort(
      fakeKeyPort({
        keyedUrls: () => keyed,
        subscribe: (listener) => {
          changed = listener;
          return () => undefined;
        },
      }),
    );
    keyed = [LOCAL];
    changed();
    changed();
    await vi.waitFor(() => expect(useLlmProfilesStore.getState().checks.k?.kind).toBe('ok'));
    expect(listModels).toHaveBeenCalledTimes(1);
    useLlmKeysStore.setState({ keyed: [] });
  });
});
