// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseHistoryDetail } from '@/comfy/schema';
import { useTaskResult } from '@/hooks/run/use-task-result';

import { queueTask } from '../helpers/queue';

const ID = 'p1';
const fetched = vi.hoisted(() => ({ count: 0, respond: (): unknown => null }));

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchHistoryItem: (_baseUrl: string, promptId: string) => {
    fetched.count += 1;
    return Promise.resolve(parseHistoryDetail(fetched.respond(), promptId));
  },
}));

const TASK = queueTask(ID, []);

function mount() {
  return renderHook(() => {
    const [cached, setCached] = useState<unknown>(null);
    const [onDetail] = useState(() => (_id: string, raw: unknown) => setCached(raw));
    const result = useTaskResult(TASK, 'http://127.0.0.1:8188', {
      cached,
      onDetail,
      rejected: false,
    });
    return { result, cached };
  });
}

beforeEach(() => {
  fetched.count = 0;
});

afterEach(cleanup);

describe('実行内容の取り直し', () => {
  it('読める応答は控え、控えから出して取り直さない', async () => {
    const nodes = { 1: { class_type: 'A', inputs: {} } };
    fetched.respond = () => ({ [ID]: { prompt: [0, ID, nodes, {}, []], outputs: {} } });
    const { result } = mount();

    await waitFor(() => expect(result.current.cached).not.toBeNull());
    await waitFor(() => expect(result.current.result?.nodes).toEqual(nodes));
    expect(fetched.count).toBe(1);
  });

  it('prompt の無い応答は控えず、取り直し続けない', async () => {
    fetched.respond = () => ({ [ID]: { outputs: {} } });
    const { result } = mount();

    await waitFor(() => expect(result.current.result).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.cached).toBeNull();
    expect(fetched.count).toBe(1);
  });
});
