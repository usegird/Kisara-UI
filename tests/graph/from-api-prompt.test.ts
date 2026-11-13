import { describe, expect, it } from 'vitest';

import { isApiPrompt, workflowFromApiPrompt } from '@/graph/from-api-prompt';
import { linkIndex } from '@/graph/link-read';
import { nodeInputs, nodeOutputs, type Workflow } from '@/graph/types';

import { definition, definitionMap, socket, widget } from '../helpers/definitions';

// ─────────────────────────────
// API Prompt Format から Workflow JSON を組み立てる。
// ─────────────────────────────

const definitions = definitionMap(
  definition('Loader', [widget('ckpt_name', 'COMBO')], {
    outputs: [{ name: 'MODEL', type: 'MODEL' }],
  }),
  definition('Sampler', [socket('model', 'MODEL'), widget('seed', 'INT'), widget('cfg', 'FLOAT')], {
    outputs: [{ name: 'LATENT', type: 'LATENT' }],
  }),
);

function node(workflow: Workflow, id: number): Workflow['nodes'][number] | undefined {
  return workflow.nodes.find((candidate) => candidate.id === id);
}

describe('API Prompt Format から組み立てる', () => {
  it('形を見分ける。どのノードも class_type と inputs を持つときだけ', () => {
    expect(isApiPrompt({ '1': { class_type: 'Loader', inputs: {} } })).toBe(true);
    expect(isApiPrompt({})).toBe(false);
    expect(isApiPrompt({ nodes: [], links: [] })).toBe(false);
  });

  it('値は定義の位置へ書き、線は入力の口へ張る', () => {
    const workflow = workflowFromApiPrompt(
      {
        '4': { class_type: 'Loader', inputs: { ckpt_name: 'a.safetensors' } },
        '9': { class_type: 'Sampler', inputs: { model: ['4', 0], seed: 5, cfg: 7 } },
      },
      definitions,
    );

    // seed の後ろの制御は、同じ値で作り直せるよう固定にする
    expect(node(workflow, 9)?.widgets_values).toEqual([5, 'fixed', 7]);
    expect(node(workflow, 4)?.widgets_values).toEqual(['a.safetensors']);
    const [link] = [...linkIndex(workflow.links).values()];
    expect(link).toMatchObject({ originId: 4, originSlot: 0, targetId: 9, targetSlot: 0 });
    // 位置は処理順に並べ直す（左から Loader → Sampler）
    expect(node(workflow, 4)?.pos[0]).toBeLessThan(node(workflow, 9)?.pos[0] ?? NaN);
  });

  it('線で受けるパラメータは入力の口に変え、定義の無い出どころには口を足す', () => {
    const workflow = workflowFromApiPrompt(
      {
        '3': { class_type: 'MissingSeed', inputs: { value: 1 } },
        '5:2': { class_type: 'Sampler', inputs: { seed: ['3', 0], cfg: 7 } },
      },
      definitions,
    );

    // 名前空間つきの id には空いている番号を振る
    const sampler = workflow.nodes.find((candidate) => candidate.type === 'Sampler');
    expect(sampler?.id).toBe(4);
    const seed = nodeInputs(sampler).find((input) => input.name === 'seed');
    expect(seed?.widget).toEqual({ name: 'seed' });
    expect(typeof seed?.link).toBe('number');
    expect(nodeOutputs(node(workflow, 3))).toHaveLength(1);
    expect(node(workflow, 3)?.widgets_values).toEqual([1]);
  });
});
