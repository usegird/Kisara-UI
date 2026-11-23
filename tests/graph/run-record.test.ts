import { describe, expect, it } from 'vitest';

import { splitRun, type SplitRun } from '@/graph/run-record';

import { definition, definitionMap, widget } from '../helpers/definitions';

const OUTPUT = { outputNode: true };

const DEFINITIONS = definitionMap(
  definition('Sampler', [widget('seed', 'INT'), widget('steps', 'INT')], OUTPUT),
  definition('Text', [widget('text', 'STRING', { multiline: true })], OUTPUT),
  definition('Title', [widget('title', 'STRING')], OUTPUT),
  definition('Noise', [widget('amount', 'INT', { control_after_generate: true })], OUTPUT),
);

interface Values {
  readonly seed?: number;
  readonly text?: string;
  readonly pos?: [number, number];
}

function workflow(values: Values = {}): Record<string, unknown> {
  return {
    id: 'wf',
    revision: 3,
    nodes: [
      {
        id: 3,
        type: 'Sampler',
        pos: values.pos ?? [0, 0],
        size: [200, 100],
        widgets_values: [values.seed ?? 1, 'randomize', 20],
      },
      { id: 6, type: 'Text', pos: [0, 0], widgets_values: [values.text ?? 'a cat'] },
      { id: 7, type: 'Title', pos: [0, 0], title: 'Heading', widgets_values: ['fixed title'] },
    ],
    links: [],
    extra: { ds: { scale: 1, offset: [0, 0] } },
  };
}

function split(raw: unknown): SplitRun {
  const result = splitRun(raw, DEFINITIONS);
  if (result === null) throw new Error('split failed');
  return result;
}

describe('splitRun', () => {
  it('シードとプロンプトの値を、ノード id・入力名と組にして拾い、指すノードの名前とコメントを添える', () => {
    const result = split(workflow({ seed: 42, text: 'a dog' }));

    expect(result.seeds).toEqual([42]);
    expect(result.prompts).toEqual(['a dog']);
    expect(result.seedSlots).toEqual([['3', 'seed']]);
    expect(result.promptSlots).toEqual([['6', 'text']]);
    expect(result.nodes).toEqual({ '3': ['Sampler'], '6': ['Text'] });
  });

  it('コメント（title）があれば名前と並べて持つ', () => {
    const raw = workflow();
    (raw.nodes as { id: number; title?: string }[])[0]!.title = 'main sampler';

    expect(split(raw).nodes['3']).toEqual(['Sampler', 'main sampler']);
  });

  it('宣言で制御が付いた入力もシードにする', () => {
    const raw = { nodes: [{ id: 1, type: 'Noise', widgets_values: [9, 'increment'] }], links: [] };

    expect(split(raw).seeds).toEqual([9]);
  });

  it('アプリ入力の値（extra.kisara.values）を入れてから分ける', () => {
    const raw = {
      ...workflow(),
      extra: {
        linearData: {
          inputs: [
            [3, 'seed'],
            [3, 'steps'],
            [6, 'text'],
          ],
        },
        kisara: { values: { '3': { seed: 77, steps: 30 }, '6': { text: 'app' } } },
      },
    };

    const result = split(raw);
    expect(result.seeds).toEqual([77]);
    expect(result.prompts).toEqual(['app']);
  });

  it('Workflow JSON の形でなければ null', () => {
    expect(splitRun({ prompt: {} }, DEFINITIONS)).toBeNull();
    expect(splitRun('x', DEFINITIONS)).toBeNull();
  });
});
