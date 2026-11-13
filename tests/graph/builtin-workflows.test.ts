import { describe, expect, it } from 'vitest';

import { appInputOrder } from '@/graph/app-input-order';
import { builtinTemplateSection, loadBuiltinWorkflow } from '@/graph/builtin-workflows';
import { linkIndex } from '@/graph/link-read';
import { parseWorkflow } from '@/graph/normalize';
import { nodeInputs, nodeOutputs } from '@/graph/types';

import { template } from '../helpers/template';

// ─────────────────────────────
// 標準のワークフロー。テンプレートの選択のカテゴリと、同梱の本体の形。
// ─────────────────────────────

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
    // 名前が同じでも、同梱の印が無ければ接続先のもの
    expect(loadBuiltinWorkflow(template('kisara-a1111-txt2img'))).toBeNull();
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

  it('アプリ入力はモデル・プロンプトから始まり、モデルの名前は持たない', async () => {
    const workflow = parseWorkflow(await firstBuiltin());

    expect(
      appInputOrder(workflow)
        .slice(0, 2)
        .map((ref) => ref.widgetName),
    ).toEqual(['ckpt_name', 'wildcard_text']);
    expect(workflow.nodes.find((entry) => entry.id === 1)?.widgets_values).toEqual(['']);
  });
});
