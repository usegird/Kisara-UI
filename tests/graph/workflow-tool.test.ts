import { describe, expect, it } from 'vitest';

import { parseToolArguments } from '@/chat/tool-arguments';
import { ownData } from '@/graph/own-data';
import type { Workflow } from '@/graph/types';
import {
  argumentInputNames,
  argumentSchema,
  imageArguments,
  outputNodes,
  overlayArgumentValues,
  passesOutput,
  readWorkflowTool,
  toolArguments,
  withArgumentValue,
  withImageChoices,
  withWorkflowTool,
  type WorkflowTool,
} from '@/graph/workflow-tool';

import { definition, definitionMap, widget } from '../helpers/definitions';
import { bareNode } from '../helpers/workflow';

const definitions = definitionMap(
  definition('Prompt', [
    widget('text', 'STRING'),
    widget('steps', 'INT', { min: 1, max: 50 }),
    widget('cfg', 'FLOAT', { min: 0, max: 10 }),
    widget('flag', 'BOOLEAN'),
    { ...widget('sampler', 'COMBO'), options: ['euler', 'dpm'] },
    widget('image', 'IMAGE'),
  ]),
);

function workflow(inputs: readonly string[], mode = 0, linked = true): Workflow {
  const links = linked ? [{ name: 'in', type: 'IMAGE', link: 1 }] : [];
  return {
    nodes: [bareNode({ id: 3, type: 'Prompt', mode, inputs: links })],
    links: [],
    extra: { ds: { scale: 1 }, linearData: { inputs: inputs.map((name) => [3, name]) } },
  };
}

function tool(params: WorkflowTool['params']): WorkflowTool {
  return { name: 'make_image', description: 'Makes one image.', params, outputs: [] };
}

const param = (
  input: string,
  name: string,
  mode: WorkflowTool['params'][number]['mode'] = 'overwrite',
): WorkflowTool['params'][number] => ({ nodeId: '3', input, name, description: '', mode });

describe('定義の読み書き', () => {
  it('書いた定義を読み戻せ、ほかの extra は残る', () => {
    const tags = { ...param('text', 'prompt', 'append'), description: 'English tags' };
    const written = withWorkflowTool(workflow(['text']), { ...tool([tags]), outputs: ['9'] });
    expect(written.extra).toMatchObject({ ds: { scale: 1 } });
    expect(readWorkflowTool(written)).toEqual({
      name: 'make_image',
      description: 'Makes one image.',
      params: [tags],
      outputs: ['9'],
    });
  });

  it('消すと独自の持ち物ごと落ちる。読めない形は定義なし', () => {
    const removed = withWorkflowTool(withWorkflowTool(workflow([]), tool([])), null);
    expect(ownData(removed)).toBeNull();
    expect(readWorkflowTool({ extra: { kisara: { tool: 'x' } } })).toBeNull();
  });

  it('引数名が空の欄は引数にしない', () => {
    const raw = {
      extra: { kisara: { tool: { name: 'a', params: { 3: { text: { name: ' ' } } } } } },
    };
    expect(readWorkflowTool(raw)?.params).toEqual([]);
  });
});

describe('引数の形', () => {
  it('入力の型から JSON Schema の型を作る', () => {
    const inputs = definitions.get('Prompt')?.inputs ?? [];
    const schemas = Object.fromEntries(inputs.map((input) => [input.name, argumentSchema(input)]));
    expect(schemas.text).toEqual({ type: 'string' });
    expect(schemas.steps).toEqual({ type: 'integer', minimum: 1, maximum: 50 });
    expect(schemas.flag).toEqual({ type: 'boolean' });
    expect(schemas.sampler).toEqual({ type: 'string', enum: ['euler', 'dpm'] });
    expect(schemas.image).toBeNull();
  });

  it('アプリ入力でない欄・引数にできない型・字の決まりに合わない名前・重なりは送らない', () => {
    const args = toolArguments(
      workflow(['text', 'steps', 'image']),
      definitions,
      tool([
        param('text', 'prompt'),
        param('cfg', 'cfg'),
        param('image', 'image'),
        param('steps', 'bad name'),
        param('steps', 'prompt'),
      ]),
    );
    expect(args.map((arg) => arg.name)).toEqual(['prompt']);
  });

  it('送る引数は説明と型を持ち、関数の定義（chat/request）にそのまま渡せる', () => {
    const args = toolArguments(workflow(['text']), definitions, {
      ...tool([{ ...param('text', 'prompt'), description: 'Tags' }]),
    });
    expect(args).toMatchObject([
      { name: 'prompt', description: 'Tags', schema: { type: 'string' } },
    ]);
  });
});

describe('結果の画像を出すノード', () => {
  const withSave: Workflow = {
    ...workflow([]),
    nodes: [
      bareNode({ id: 3, type: 'Prompt', inputs: [{ name: 'in', type: 'IMAGE', link: 1 }] }),
      bareNode({ id: 9, type: 'Save', inputs: [{ name: 'images', type: 'IMAGE', link: 2 }] }),
      bareNode({ id: 10, type: 'Save', mode: 2, inputs: [{ name: 'i', type: 'IMAGE', link: 3 }] }),
      bareNode({ id: 11, type: 'Save' }),
    ],
  };
  const withOutputs = definitionMap(
    ...definitions.values(),
    definition('Save', [], { outputNode: true }),
  );

  it('出力ノードのうち、無効でも孤立してもいないものだけを選べる', () => {
    expect(outputNodes(withSave, withOutputs)).toEqual([{ nodeId: '9' }]);
  });

  it('選んだノード（subgraph の中は外のノード）の画像だけを渡す。選ばなければすべて', () => {
    expect(passesOutput(['9'], '9')).toBe(true);
    expect(passesOutput(['9'], '12')).toBe(false);
    expect(passesOutput(['59'], '59:70')).toBe(true);
    expect(passesOutput([], '12')).toBe(true);
  });
});

describe('無効・線の無いノード', () => {
  const params = [param('text', 'prompt')];

  it.each([
    ['ミュート', workflow(['text'], 2)],
    ['バイパス', workflow(['text'], 4)],
    ['線が無い', workflow(['text'], 0, false)],
  ])('%s のノードの欄は、設定してあっても送らない', (_label, wf) => {
    expect(toolArguments(wf, definitions, tool(params))).toEqual([]);
    expect(readWorkflowTool(withWorkflowTool(wf, tool(params)))?.params).toHaveLength(1);
  });
});

const wf = workflow(['text', 'steps', 'sampler']);
const values = (text: string): Map<string, Record<string, unknown>> => new Map([['3', { text }]]);

describe('確かめた値の重ね方', () => {
  const args = toolArguments(
    workflow(['text', 'steps', 'sampler']),
    definitions,
    tool([param('text', 'prompt'), param('steps', 'steps'), param('sampler', 'sampler')]),
  );

  it('作った引数の形で LLM の値を確かめられる（確かめは chat/tool-calls）', () => {
    const parsed = parseToolArguments(args, '{"prompt":"cat","steps":20,"sampler":"euler"}');
    expect(parsed.ok && parsed.values.get('3')).toEqual({
      text: 'cat',
      steps: 20,
      sampler: 'euler',
    });
    expect(parseToolArguments(args, '{"prompt":"a","steps":99,"sampler":"euler"}').ok).toBe(false);
  });

  it('タブの値に重ね、タブの値そのものは変えない', () => {
    const base = new Map([['3', { text: 'dog', cfg: 7 }]]);
    const merged = overlayArgumentValues(wf, definitions, base, { args, values: values('cat') });
    expect(merged.get('3')).toEqual({ text: 'cat', cfg: 7 });
    expect(base.get('3')).toEqual({ text: 'dog', cfg: 7 });
  });

  it('空の文字（空白だけを含む）は上書きでも入れず、App 値のまま', () => {
    const base = new Map([['3', { text: 'dog' }]]);
    for (const empty of ['', '  ']) {
      const merged = overlayArgumentValues(wf, definitions, base, { args, values: values(empty) });
      expect(merged.get('3')).toEqual({ text: 'dog' });
    }
    const appending = toolArguments(wf, definitions, tool([param('text', 'prompt', 'append')]));
    const merged = overlayArgumentValues(wf, definitions, base, {
      args: appending,
      values: values(''),
    });
    expect(merged.get('3')).toEqual({ text: 'dog' });
  });
});

describe('前方追加・後方追加', () => {
  const merging = (
    node: Workflow,
    mode: 'prepend' | 'append' = 'append',
  ): ReturnType<typeof toolArguments> =>
    toolArguments(node, definitions, tool([param('text', 'prompt', mode)]));

  it('前方追加は App 値の前に区切りを挟んで足す（先頭の区切りと空白は落とす）', () => {
    const base = new Map([['3', { text: ', masterpiece' }]]);
    const args = merging(wf, 'prepend');
    const merged = overlayArgumentValues(wf, definitions, base, { args, values: values('cat') });
    expect(merged.get('3')).toEqual({ text: 'cat, masterpiece' });
  });

  it('App 値の後ろに区切りを挟んで足す（末尾の区切りと空白は落とす）', () => {
    const base = new Map([['3', { text: 'masterpiece, ' }]]);
    const merged = overlayArgumentValues(wf, definitions, base, {
      args: merging(wf),
      values: values('cat'),
    });
    expect(merged.get('3')).toEqual({ text: 'masterpiece, cat' });
  });

  it('App 値が無ければノードの値の後ろに足す', () => {
    const node: Workflow = {
      ...wf,
      nodes: wf.nodes.map((item) => ({
        ...item,
        widgets_values: ['dog', 20, 7, false, 'euler', 'a.png'],
      })),
    };
    const merged = overlayArgumentValues(node, definitions, new Map(), {
      args: merging(node),
      values: values('cat'),
    });
    expect(merged.get('3')).toEqual({ text: 'dog, cat' });
  });

  it('文字でない引数・選択肢は、足す入れ方にしても置き換える', () => {
    const args = toolArguments(
      wf,
      definitions,
      tool([param('steps', 'steps', 'append'), param('sampler', 'sampler', 'prepend')]),
    );
    expect(args.map((arg) => arg.mode)).toEqual(['overwrite', 'overwrite']);
  });
});

describe('アプリ入力の列の引数の印', () => {
  it('引数名を付けた欄を引数名と並べ、無効なノードの欄は入れない', () => {
    const tags = param('text', 'prompt');
    expect(argumentInputNames(withWorkflowTool(workflow(['text']), tool([tags])))).toEqual([
      '3/text=prompt',
    ]);
    expect(argumentInputNames(withWorkflowTool(workflow(['text'], 2), tool([tags])))).toEqual([]);
    expect(argumentInputNames(null)).toEqual([]);
  });
});

describe('画像の引数', () => {
  const pictureDefinitions = definitionMap(
    definition('Prompt', [
      widget('text', 'STRING'),
      { ...widget('picture', 'COMBO', { image_upload: true }), options: ['a.png', 'b.png'] },
    ]),
  );

  it('画像を読み込む選択肢は、ファイル名の代わりに参照名を選ばせ、画像の印を付ける', () => {
    const picture = pictureDefinitions
      .get('Prompt')
      ?.inputs.find((input) => input.name === 'picture');
    expect(picture === undefined ? null : argumentSchema(picture)).toEqual({
      type: 'string',
      enum: ['avatar'],
    });
    const args = toolArguments(
      workflow(['text', 'picture']),
      pictureDefinitions,
      tool([param('text', 'prompt'), param('picture', 'source', 'append')]),
    );
    expect(args.map((arg) => [arg.name, arg.image ?? false, arg.mode])).toEqual([
      ['prompt', false, 'overwrite'],
      ['source', true, 'overwrite'],
    ]);
  });

  it('確かめた値から画像の参照名を拾い、置いた値に差し替える', () => {
    const args = toolArguments(
      workflow(['text', 'picture']),
      pictureDefinitions,
      tool([param('text', 'prompt'), param('picture', 'source')]),
    );
    const parsed = parseToolArguments(args, '{"prompt":"smile","source":"avatar"}');
    if (!parsed.ok) throw new Error(parsed.problem.code);
    expect(imageArguments(args, parsed.values)).toEqual([
      { nodeId: '3', input: 'picture', reference: 'avatar' },
    ]);
    const placed = withArgumentValue(parsed.values, '3', 'picture', 'kisara/a.png [temp]');
    expect(placed.get('3')).toEqual({ text: 'smile', picture: 'kisara/a.png [temp]' });
    expect(parsed.values.get('3')?.picture).toBe('avatar');
    expect(parseToolArguments(args, '{"prompt":"x","source":"a.png"}').ok).toBe(false);
  });

  it('会話ごとの参照名を画像の引数の選択肢にし、ほかの引数は変えない', () => {
    const args = toolArguments(
      workflow(['text', 'picture']),
      pictureDefinitions,
      tool([param('text', 'prompt'), param('picture', 'source')]),
    );
    const chosen = withImageChoices(args, ['avatar', 'output/a.png']);
    expect(chosen.map((arg) => arg.schema)).toEqual([
      { type: 'string' },
      { type: 'string', enum: ['avatar', 'output/a.png'] },
    ]);
    expect(parseToolArguments(chosen, '{"prompt":"x","source":"output/a.png"}').ok).toBe(true);
  });
});
