import { describe, expect, it } from 'vitest';

import {
  missingModels,
  modelDirectories,
  sourcePageOf,
  workflowModels,
} from '@/graph/missing-models';
import type { Workflow, WorkflowNode } from '@/graph/types';

import { bareNode } from '../helpers/workflow';

const URL = 'https://huggingface.co/x/y/resolve/main/vae/a.safetensors';

function loader(id: number, value: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return bareNode({
    id,
    type: 'VAELoader',
    widgets_values: [value],
    properties: { models: [{ name: 'a.safetensors', url: URL, directory: 'vae' }] },
    ...overrides,
  });
}

function workflowOf(nodes: WorkflowNode[], extra: Partial<Workflow> = {}): Workflow {
  return { nodes, links: [], ...extra };
}

describe('名指しするモデル', () => {
  it('欄で選んでいるモデルだけを拾い、https の取得先はリンクにできる', () => {
    const models = workflowModels(
      workflowOf([loader(1, 'a.safetensors'), loader(2, 'b.safetensors')]),
    );
    expect(models.map((model) => model.promptNodeId)).toEqual(['1']);
    expect(models[0]?.linkable).toBe(true);
    expect(modelDirectories(models)).toEqual(['vae']);
  });

  it('取得先は Hugging Face の直リンクならフォルダの一覧のページに変え、ほかはそのまま', () => {
    expect(workflowModels(workflowOf([loader(1, 'a.safetensors')]))[0]?.url).toBe(
      'https://huggingface.co/x/y/tree/main/vae',
    );
    expect(
      sourcePageOf('https://huggingface.co/x/y/resolve/main/a.safetensors?download=true'),
    ).toBe('https://huggingface.co/x/y/tree/main');
    expect(sourcePageOf('https://example.com/a.safetensors')).toBe(
      'https://example.com/a.safetensors',
    );
    expect(sourcePageOf('not a url')).toBe('not a url');
  });

  it('サブフォルダに置いた値も最後の要素で同じモデルとみなす', () => {
    expect(workflowModels(workflowOf([loader(1, 'flux\\a.safetensors')]))).toHaveLength(1);
  });

  it('https でない取得先はリンクにしない', () => {
    const node = loader(1, 'a.safetensors', {
      properties: {
        models: [{ name: 'a.safetensors', url: 'javascript:alert(1)', directory: 'vae' }],
      },
    });
    expect(workflowModels(workflowOf([node]))[0]?.linkable).toBe(false);
  });

  it('subgraph の中は外側の id を前に付け、無効化は中へ引き継ぎ、輪でも止まる', () => {
    const inner = loader(5, 'a.safetensors');
    const outer = bareNode({ id: 9, type: 'sg', mode: 4 });
    const sg = { id: 'sg', name: 'S', nodes: [inner, bareNode({ id: 6, type: 'sg' })], links: [] };
    const models = workflowModels(workflowOf([outer], { definitions: { subgraphs: [sg] } }));
    expect(models.map((model) => [model.promptNodeId, model.disabled])).toEqual([['9:5', true]]);
  });

  it('中の値が別のモデルでも、外側の欄がそのモデルを指していれば拾う', () => {
    const inner = loader(5, 'other.safetensors');
    const outer = bareNode({ id: 9, type: 'sg', widgets_values: ['x', 'a.safetensors'] });
    const sg = { id: 'sg', name: 'S', nodes: [inner], links: [] };
    const models = workflowModels(workflowOf([outer], { definitions: { subgraphs: [sg] } }));
    expect(models.map((model) => [model.promptNodeId, model.selected])).toEqual([
      ['9:5', 'a.safetensors'],
    ]);
  });

  it('形の違う項目は捨てる', () => {
    const node = loader(1, 'a.safetensors', {
      properties: { models: [3, { name: 'a.safetensors' }] },
    });
    expect(workflowModels(workflowOf([node]))).toEqual([]);
  });
});

describe('一覧に無いモデル', () => {
  const models = workflowModels(workflowOf([loader(1, 'a.safetensors')]));

  it('一覧に無ければ出し、取得が要る（別のフォルダの同じ名前も無い）', () => {
    const missing = missingModels(models, () => ['other.safetensors']);
    expect(missing.map((model) => model.elsewhere)).toEqual([null]);
    expect(missingModels(models, () => ['a.safetensors'])).toHaveLength(0);
  });

  it('同じ名前が別のフォルダにあれば、その名前を添えて出す（ComfyUI は一致しない値を断る）', () => {
    const missing = missingModels(models, () => ['sub\\a.safetensors']);
    expect(missing.map((model) => model.elsewhere)).toEqual(['sub/a.safetensors']);
  });

  it('欄の値をフォルダごと比べる（フォルダ付きで選んでいれば一覧と合う）', () => {
    const chosen = workflowModels(workflowOf([loader(1, 'sub/a.safetensors')]));
    expect(missingModels(chosen, () => ['sub/a.safetensors'])).toHaveLength(0);
  });

  it('一覧を取れていない種別は決められないので出さない', () => {
    expect(missingModels(models, () => null)).toHaveLength(0);
  });
});
