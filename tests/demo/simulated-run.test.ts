import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { planRun, runSimulation } from '@/demo/simulated-run';
import type { ApiPrompt } from '@/graph/to-api-prompt';
import { useExecutionStore } from '@/store/use-execution-store';

const PROMPT: ApiPrompt = {
  '2': { class_type: 'Out', inputs: { images: ['1', 0] } },
  '1': { class_type: 'Sampler', inputs: { model: ['3', 0], steps: 3 } },
  '3': { class_type: 'Loader', inputs: { ckpt_name: 'x' } },
};

const isOutput = (classType: string): boolean => classType === 'Out';

describe('planRun', () => {
  it('指されるノードを先に並べ、手数と出力ノードを拾う', () => {
    expect(planRun(PROMPT, isOutput)).toEqual([
      { nodeId: '3', steps: 0, output: false },
      { nodeId: '1', steps: 3, output: false },
      { nodeId: '2', steps: 0, output: true },
    ]);
  });

  it('同じ段は id を数として比べる（2 は 10 より前）', () => {
    const prompt: ApiPrompt = {
      '10': { class_type: 'Loader', inputs: {} },
      '2': { class_type: 'Loader', inputs: {} },
    };
    expect(planRun(prompt, isOutput).map((step) => step.nodeId)).toEqual(['2', '10']);
  });
});

describe('runSimulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExecutionStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('処理の順に実行中にし、手数を進め、出力ノードと終わりを知らせる', () => {
    const outputs: string[] = [];
    const onDone = vi.fn();
    runSimulation(planRun(PROMPT, isOutput), {
      onOutput: (id) => outputs.push(id),
      onStep: () => undefined,
      onDone,
    });
    expect(useExecutionStore.getState().status).toBe('running');

    vi.advanceTimersByTime(130);
    expect(useExecutionStore.getState().runningNode).toBe('1');
    expect(useExecutionStore.getState().nodeStates['1']).toBe('running');

    vi.advanceTimersByTime(80);
    expect(useExecutionStore.getState().progress).toEqual({ value: 2, max: 3 });

    vi.runAllTimers();
    expect(outputs).toEqual(['2']);
    expect(onDone).toHaveBeenCalledOnce();
    expect(useExecutionStore.getState().status).toBe('done');
  });

  it('止めたら、その先の事象を流さず、実行の状況を解く', () => {
    const onDone = vi.fn();
    const stop = runSimulation(planRun(PROMPT, isOutput), {
      onOutput: () => undefined,
      onStep: () => undefined,
      onDone,
    });
    vi.advanceTimersByTime(130);
    stop();
    vi.runAllTimers();

    expect(onDone).not.toHaveBeenCalled();
    expect(useExecutionStore.getState().status).not.toBe('running');
  });
});
