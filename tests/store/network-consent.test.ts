// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { semanticModelFor } from '@/chat/semantic-models';
import { comfyPort } from '@/store/ports/comfy-port';
import { embeddingPort, installEmbeddingPort } from '@/store/ports/embedding-port';
import { installLlmPort, llmPort } from '@/store/ports/llm-port';
import { ConsentRequiredError } from '@/store/ports/network-consent';
import { useSettingsStore } from '@/store/use-settings-store';
import { TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

import { fakeEmbeddingPort } from '../helpers/embedding';
import { fakeLlmPort } from '../helpers/llm';

const BASE = 'http://comfy';
const FILE = { filename: 'a.png', subfolder: '', type: 'output' } as const;

const fetchSpy = vi.spyOn(globalThis, 'fetch');

beforeEach(() => {
  fetchSpy.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
});

afterEach(() => {
  useSettingsStore.setState({ loreSemantic: false });
});

describe('ComfyUI の窓口（利用規約）', () => {
  beforeEach(() => useTermsStore.setState({ accepted: null }));

  it('同意していなければ、要求は送らずに同意が無いことで失敗する', async () => {
    await expect(comfyPort().definitions.fetchAll(BASE)).rejects.toBeInstanceOf(
      ConsentRequiredError,
    );
    await expect(comfyPort().run.interrupt(BASE, 'p1')).rejects.toBeInstanceOf(
      ConsentRequiredError,
    );
    await expect(comfyPort().workflows.list(BASE)).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('同意していなければ、画面が読み込む URL を作らず、通知の接続も張らない', () => {
    expect(comfyPort().queue.outputSrc(BASE, FILE)).toBeNull();
    expect(comfyPort().inputImages.src(BASE, 'a.png')).toBeNull();
    expect(() =>
      comfyPort().events.connect({
        baseUrl: BASE,
        clientId: 'c',
        onEvent: () => undefined,
        onStatus: () => undefined,
        reconnect: {
          maxAttempts: 0,
          baseDelayMs: 0,
          maxDelayMs: 0,
          openTimeoutMs: 0,
          maxDrops: null,
        },
      }),
    ).toThrow(ConsentRequiredError);
  });

  it('通信しない関数は同意が無くても使える', () => {
    expect(comfyPort().connection.failureOf(new Error('x'))).toBeNull();
    const entry = { prompt: [0, 'p1', { '1': { class_type: 'A', inputs: {} } }, {}, []] };
    const nodes = comfyPort().queue.entryNodesOf(entry);
    expect(nodes).not.toBeNull();
    expect(
      comfyPort()
        .queue.promptNodesOf(nodes ?? {})
        .get('1')?.classType,
    ).toBe('A');
    expect(comfyPort().queue.entryFailureOf(entry)).toBeNull();
  });

  it('同意していなければ、テンプレートとモデルの画像の URL も作らない', () => {
    const template = {
      name: 'flux',
      title: 'Flux',
      description: '',
      tags: [],
      models: [],
      mediaType: 'image',
      mediaSubtype: 'webp',
      date: null,
      usage: null,
      size: null,
    };
    expect(comfyPort().workflows.templateThumbnailSrc(BASE, template)).toBeNull();
    const model = {
      name: 'a.safetensors',
      pathIndex: 0,
      modified: null,
      created: null,
      size: null,
    };
    expect(comfyPort().models.previewSrc(BASE, 'checkpoints', model)).toBeNull();
  });

  it('同意した後は、包み直さずにそのまま通す', async () => {
    useTermsStore.setState({
      accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-21T00:00:00.000Z' },
    });
    expect(comfyPort().queue.outputSrc(BASE, FILE)).toContain('/view');
    await comfyPort()
      .definitions.fetchAll(BASE)
      .catch(() => null);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe('LLM の窓口（外部クラウド接続の注意）', () => {
  const CLOUD = { baseUrl: 'https://openrouter.ai/api/v1' };
  const LOCAL = { baseUrl: 'http://127.0.0.1:8080/v1' };

  beforeEach(() => {
    useTermsStore.setState({ cloud: null });
  });

  it('合意していなければ、外部のクラウドへは送らずに未合意で返す', async () => {
    const port = fakeLlmPort();
    installLlmPort(port);
    const listed = await llmPort().listModels(CLOUD);
    const streamed = await llmPort().streamChat(
      CLOUD,
      { model: 'm', messages: [], stream: true, stream_options: { include_usage: true } },
      { onEvent: () => undefined, signal: new AbortController().signal },
    );
    expect(listed).toEqual({ ok: false, failure: { kind: 'consent' } });
    expect(streamed).toEqual({ ok: false, failure: { kind: 'consent' } });
    expect(port.requests).toHaveLength(0);
  });

  it('手元のサーバーへは、合意が無くても送る', async () => {
    installLlmPort(fakeLlmPort(['m']));
    const listed = await llmPort().listModels(LOCAL);
    expect(listed.ok).toBe(true);
  });

  it('OpenRouter 以外でも、私的なアドレスの外なら合意が要る', async () => {
    const port = fakeLlmPort();
    installLlmPort(port);
    const listed = await llmPort().listModels({ baseUrl: 'https://api.together.xyz/v1' });
    expect(listed).toEqual({ ok: false, failure: { kind: 'consent' } });
    expect(port.requests).toHaveLength(0);
  });
});

describe('ComfyUI の窓口（外部の ComfyUI に接続する注意）', () => {
  const REMOTE = 'https://abc-8188.proxy.runpod.net';
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = useSettingsStore.getState().baseUrl;
    useTermsStore.setState({
      accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-21T00:00:00.000Z' },
      comfyRemote: null,
    });
    useSettingsStore.setState({ baseUrl: REMOTE });
  });

  afterEach(() => {
    useSettingsStore.setState({ baseUrl });
    useTermsStore.setState({ comfyRemote: null });
  });

  it('利用規約に同意していても、私的なアドレスの外の接続先には注意に合意するまで送らない', async () => {
    await expect(comfyPort().connection.check(REMOTE)).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(comfyPort().queue.outputSrc(REMOTE, FILE)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    useTermsStore.getState().acceptComfyRemote();
    await comfyPort()
      .connection.check(REMOTE)
      .catch(() => null);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe('近似判定の窓口（機能を有効にしたときの承認）', () => {
  it('機能を有効にしていなければ、モデルを落とさない', async () => {
    const port = fakeEmbeddingPort();
    const load = vi.spyOn(port, 'load');
    installEmbeddingPort(port);
    const result = await embeddingPort().load(semanticModelFor('en', ''), () => undefined);
    expect(result.ok).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('有効にしていれば落とす', async () => {
    useSettingsStore.setState({ loreSemantic: true });
    installEmbeddingPort(fakeEmbeddingPort());
    const result = await embeddingPort().load(semanticModelFor('en', ''), () => undefined);
    expect(result.ok).toBe(true);
  });
});
