import { describe, expect, it } from 'vitest';

import { appInputOrder } from '@/graph/app-input-order';
import { builtinTemplateSection, loadBuiltinWorkflow } from '@/graph/builtin-workflows';
import { linkIndex } from '@/graph/link-read';
import { parseWorkflow } from '@/graph/normalize';
import { nodeInputs, nodeOutputs } from '@/graph/types';
import { isRecord } from '@/lib/guards';

import { template } from '../helpers/template';

async function firstBuiltin(): Promise<unknown> {
  const [template] = builtinTemplateSection().templates;
  if (!template) throw new Error('no builtin');
  const loading = loadBuiltinWorkflow(template);
  if (!loading) throw new Error('not builtin');
  return loading;
}

describe('builtinTemplateSection', () => {
  it('同梱の印を付け、サムネイルを持たない', () => {
    const { templates } = builtinTemplateSection();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((entry) => entry.builtin === true)).toBe(true);
    expect(templates.every((entry) => entry.mediaType !== 'image')).toBe(true);
  });
});

describe('loadBuiltinWorkflow', () => {
  it('接続先のテンプレートには null を返す（取りに行く側に任せる）', () => {
    expect(loadBuiltinWorkflow(template('kisara-sdxl-a1111'))).toBeNull();
  });

  it('本体は Workflow JSON として読め、線の両端が揃っている', async () => {
    const workflow = parseWorkflow(await firstBuiltin());
    const links = linkIndex(workflow.links);

    for (const entry of workflow.nodes) {
      for (const input of nodeInputs(entry)) {
        if (input.link == null) continue;
        expect(links.get(input.link)?.targetId).toBe(entry.id);
      }
      for (const output of nodeOutputs(entry)) {
        for (const id of output.links ?? []) expect(links.get(id)?.originId).toBe(entry.id);
      }
    }
  });

  it('プロンプトはクオリティタグ（ノード）と場面（アプリ入力の値）をつないで渡す', async () => {
    const raw = await firstBuiltin();
    const workflow = parseWorkflow(raw);
    const links = linkIndex(workflow.links);
    const valuesOf = (id: number): unknown[] => {
      const values = workflow.nodes.find((entry) => entry.id === id)?.widgets_values;
      return Array.isArray(values) ? values : [];
    };
    const extra = workflow.extra;
    const kisara = isRecord(extra) ? extra.kisara : undefined;
    const saved = isRecord(kisara) && isRecord(kisara.values) ? kisara.values : {};
    const sceneOf = (id: number): unknown => {
      const entry = saved[String(id)];
      return isRecord(entry) ? entry.string_b : undefined;
    };
    const linkedFrom = (id: number, name: string): number | undefined => {
      const input = nodeInputs(workflow.nodes.find((entry) => entry.id === id)).find(
        (slot) => slot.name === name,
      );
      return links.get(input?.link ?? -1)?.originId;
    };

    expect(
      appInputOrder(workflow)
        .slice(0, 2)
        .map((ref) => [ref.nodeId, ref.widgetName]),
    ).toEqual([
      [15, 'string_b'],
      [16, 'string_b'],
    ]);
    expect([linkedFrom(3, 'populated_text'), linkedFrom(4, 'text')]).toEqual([15, 16]);
    expect(valuesOf(3)[2]).toBe('fixed');
    expect([15, 16].every((id) => isFilled(valuesOf(id)[0]) && valuesOf(id)[1] === '')).toBe(true);
    expect([15, 16].every((id) => isFilled(sceneOf(id)))).toBe(true);
    expect(valuesOf(1)).toEqual(['sd_xl_base_1.0.safetensors']);
  });

  it('Hires. fix と ADetailer は If/Else Switch で切ってあり、段のノードはバイパスしない', async () => {
    const workflow = parseWorkflow(await firstBuiltin());
    const links = linkIndex(workflow.links);
    const switches = workflow.nodes.filter((entry) => entry.type === 'ComfySwitchNode');
    const branches = switches.map((entry) =>
      nodeInputs(entry).map((input) => links.get(input.link ?? -1)?.originId),
    );

    expect(switches.map((entry) => entry.widgets_values)).toEqual([[false], [false]]);
    expect(branches).toEqual([
      [6, 8],
      [9, 11],
    ]);
    expect(workflow.nodes.every((entry) => entry.mode === 0)).toBe(true);
    expect(
      appInputOrder(workflow)
        .filter((ref) => ref.widgetName === 'switch')
        .map((ref) => ref.nodeId),
    ).toEqual([13, 14]);
  });

  it('Clip skip は SDXL の既定と同じ -2 で、サンプラーは euler_ancestral・simple', async () => {
    const workflow = parseWorkflow(await firstBuiltin());
    const valuesOf = (id: number): unknown[] => {
      const values = workflow.nodes.find((entry) => entry.id === id)?.widgets_values;
      return Array.isArray(values) ? values : [];
    };

    expect(valuesOf(2)).toEqual([-2]);
    expect([6, 8].map((id) => valuesOf(id).slice(4, 6))).toEqual([
      ['euler_ancestral', 'simple'],
      ['euler_ancestral', 'simple'],
    ]);
    expect(valuesOf(11).slice(7, 9)).toEqual(['euler_ancestral', 'simple']);
  });
});

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}
