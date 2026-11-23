import { describe, expect, it } from 'vitest';

import { deleteQueued } from '@/comfy/queue';

describe('実行前のタスクの取り消し', () => {
  it('POST /queue に、そのタスクの prompt_id だけを delete で送る', async () => {
    let calledUrl = '';
    let method = '';
    let sent: unknown = null;
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calledUrl = url;
      method = init?.method ?? '';
      sent = init?.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: '',
        text: () => Promise.resolve(''),
      } as Response);
    }) as unknown as typeof fetch;

    await deleteQueued('http://x', 'p1', { fetchImpl });

    expect(calledUrl).toBe('http://x/queue');
    expect(method).toBe('POST');
    expect(sent).toBe(JSON.stringify({ delete: ['p1'] }));
  });
});
