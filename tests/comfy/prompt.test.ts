import { describe, expect, it } from 'vitest';

import { interruptRun, PromptRejectedError, submitPrompt } from '@/comfy/prompt';
import type { ApiPrompt } from '@/graph/to-api-prompt';

// ─────────────────────────────
// `POST /prompt` の呼び出し。
// **実物は叩かない**（GPU を消費する）。fetch を差し替えて検証する。
// ─────────────────────────────

const prompt: ApiPrompt = { '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } };

function respond(status: number, body: unknown): typeof fetch {
  return ((_url: string, _init?: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response)) as unknown as typeof fetch;
}

describe('実行の送信', () => {
  it('受理されたら prompt_id を返す', async () => {
    const accepted = await submitPrompt(
      'http://x',
      { prompt, clientId: 'c1' },
      { fetchImpl: respond(200, { prompt_id: 'p-1', number: 3 }) },
    );

    expect(accepted).toEqual({ promptId: 'p-1', number: 3 });
  });

  it('prompt と client_id を送る', async () => {
    let sent: unknown = null;
    const fetchImpl = ((url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      sent = { url, body: JSON.parse(body) as unknown };
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: '',
        text: () => Promise.resolve(JSON.stringify({ prompt_id: 'p-2' })),
      } as Response);
    }) as unknown as typeof fetch;

    await submitPrompt('http://x', { prompt, clientId: 'c9' }, { fetchImpl });

    expect(sent).toEqual({ url: 'http://x/prompt', body: { prompt, client_id: 'c9' } });

    // ワークフローを渡せば、画像に埋め込ませる形（extra_pnginfo.workflow）で添える
    const workflow = { nodes: [], links: [] };
    await submitPrompt('http://x', { prompt, clientId: 'c9', workflow }, { fetchImpl });
    expect(sent).toEqual({
      url: 'http://x/prompt',
      body: { prompt, client_id: 'c9', extra_data: { extra_pnginfo: { workflow } } },
    });

    // セッションを渡せば `extra_data.kisara.session` に添える
    await submitPrompt('http://x', { prompt, clientId: 'c9', session: 's1' }, { fetchImpl });
    expect(sent).toEqual({
      url: 'http://x/prompt',
      body: { prompt, client_id: 'c9', extra_data: { kisara: { session: 's1' } } },
    });
  });

  it('400 の検証エラーは、どのノードが弾かれたかを持つ', async () => {
    const body = {
      error: { message: 'Prompt has no outputs' },
      node_errors: {
        '5': {
          class_type: 'KSampler',
          errors: [{ message: 'Required input is missing', details: 'model' }],
        },
      },
    };

    await expect(
      submitPrompt('http://x', { prompt, clientId: 'c1' }, { fetchImpl: respond(400, body) }),
    ).rejects.toMatchObject({
      name: 'PromptRejectedError',
      reason: 'Prompt has no outputs',
      reasonCode: 'prompt-rejected',
      params: { reason: 'Prompt has no outputs' },
      nodeErrors: [
        {
          nodeId: '5',
          classType: 'KSampler',
          messages: ['Required input is missing: model'],
        },
      ],
    });
  });

  it('prompt_id が無い応答も受理されなかったものとして扱う', async () => {
    await expect(
      submitPrompt('http://x', { prompt, clientId: 'c1' }, { fetchImpl: respond(200, {}) }),
    ).rejects.toBeInstanceOf(PromptRejectedError);
  });

  it('中断は POST /interrupt に、その実行の prompt_id を添える', async () => {
    let calledUrl = '';
    let sent: unknown = null;
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calledUrl = url;
      sent = init?.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: '',
        text: () => Promise.resolve(''),
      } as Response);
    }) as unknown as typeof fetch;

    await interruptRun('http://x', 'p1', { fetchImpl });

    expect(calledUrl).toBe('http://x/interrupt');
    expect(sent).toBe(JSON.stringify({ prompt_id: 'p1' }));
  });
});

describe('実行が拒否されたとき', () => {
  it('403 は本文が空でも HTTP エラーとして上がる（案内は UI 側で出す）', async () => {
    // ComfyUI は --enable-cors-header 無しだと、Origin が Host と違う POST を 403 で弾く
    const fetchImpl = (() =>
      Promise.resolve({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve(''),
      } as Response)) as unknown as typeof fetch;

    await expect(
      submitPrompt('http://x', { prompt, clientId: 'c1' }, { fetchImpl }),
    ).rejects.toMatchObject({ name: 'ComfyRequestError', kind: 'http', status: 403 });
  });
});
