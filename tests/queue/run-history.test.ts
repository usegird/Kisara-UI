import { describe, expect, it } from 'vitest';

import type { HistoryRunSource } from '@/port/run-history';
import { addRuns, EMPTY_RUN_HISTORY } from '@/queue/run-history';
import {
  buildHistoryCards,
  formatHistorySession,
  historySessionTitle,
  historyTasks,
  namesUpTo,
  promptNumbers,
  runDetail,
  sessionNames,
  type HistoryCard,
} from '@/queue/run-history-view';
import { modelKindOf, type ModelKindNames } from '@/queue/task-detail';

import { definition, definitionMap, socket, widget } from '../helpers/definitions';
import { runSource } from '../helpers/run-history';

const DEFINITIONS = definitionMap(
  definition('Sampler', [widget('seed', 'INT'), widget('steps', 'INT')], { outputNode: true }),
  definition('Text', [widget('text', 'STRING', { multiline: true })], { outputNode: true }),
  definition('Loader', [widget('ckpt_name', 'COMBO')], { outputNode: true }),
  definition('Extra', [widget('model_name', 'COMBO')], { outputNode: true }),
  definition('LoraLoader', [widget('lora_name', 'COMBO')], { outputNode: true }),
);

interface Sent {
  readonly seed?: number;
  readonly text?: string;
  readonly steps?: number;
  readonly model?: string;
  readonly lora?: string;
  readonly id?: string;
  readonly extra?: string;
}

function sentWorkflow({
  seed = 1,
  text = 'a',
  steps = 20,
  model = 'base.safetensors',
  lora = 'style.safetensors',
  id = 'wf-a',
  extra = 'detail.safetensors',
}: Sent = {}): Record<string, unknown> {
  return {
    id,
    nodes: [
      { id: 1, type: 'Sampler', pos: [0, 0], widgets_values: [seed, 'randomize', steps] },
      { id: 2, type: 'Text', pos: [0, 0], widgets_values: [text] },
      { id: 3, type: 'Loader', pos: [0, 0], widgets_values: [model] },
      { id: 4, type: 'LoraLoader', pos: [0, 0], widgets_values: [lora] },
      { id: 5, type: 'Extra', pos: [0, 0], widgets_values: [extra] },
    ],
    links: [],
  };
}

function source(
  promptId: string,
  startedAt: number | null,
  paths: readonly string[],
  workflow: unknown = sentWorkflow(),
): HistoryRunSource {
  return runSource(promptId, startedAt, paths, workflow, {
    finishedAt: startedAt === null ? null : startedAt + 1_000,
  });
}

const NO_NAMES = new Map<string, string>();

const OPTIONS: ModelKindNames = {
  modelNames: new Set(['base.safetensors', 'other.safetensors']),
  loraNames: new Set([
    'style.safetensors',
    'one.safetensors',
    'two.safetensors',
    'detail.safetensors',
    'detail2.safetensors',
  ]),
};

function file(sources: readonly HistoryRunSource[], names = NO_NAMES) {
  return addRuns({
    file: EMPTY_RUN_HISTORY,
    sources,
    definitions: DEFINITIONS,
    kinds: OPTIONS,
    names,
  });
}

describe('addRuns', () => {
  it('保存していない実行も残し、開始時刻の分からない実行だけを外して古い順に並べる', () => {
    const recorded = file([
      source('b', 5_000, ['b.png']),
      source('n', 1_000, []),
      source('t', 3_000, ['p.png [temp]']),
      source('x', null, ['x.png']),
    ]);

    expect(recorded.runs.map((run) => [run.start, run.end, run.paths])).toEqual([
      [1_000, 2_000, []],
      [3_000, 4_000, ['p.png [temp]']],
      [5_000, 6_000, ['b.png']],
    ]);
  });

  it('上限を超えたら開始時刻の古い実行から外し、外した実行だけが指すプロンプトも外す', () => {
    const first = file([
      source('a', 1_000, ['a.png'], sentWorkflow({ text: 'old' })),
      source('b', 2_000, ['b.png'], sentWorkflow({ text: 'cat' })),
    ]);
    const limited = addRuns({
      file: first,
      sources: [source('c', 3_000, ['c.png'], sentWorkflow({ text: 'cat' }))],
      definitions: DEFINITIONS,
      kinds: OPTIONS,
      names: NO_NAMES,
      limit: 2,
    });

    expect(limited.runs.map((run) => run.start)).toEqual([2_000, 3_000]);
    expect(Object.keys(limited.prompts)).toHaveLength(1);
  });

  it('シードだけが違う実行は骨組みとプロンプトを使い回す', () => {
    const recorded = file([
      source('a', 1_000, ['a.png'], sentWorkflow({ seed: 1, text: 'cat' })),
      source('b', 2_000, ['b.png'], sentWorkflow({ seed: 2, text: 'cat' })),
      source('c', 3_000, ['c.png'], sentWorkflow({ seed: 3, text: 'dog' })),
    ]);

    expect(Object.keys(recorded.workflows)).toHaveLength(1);
    expect(Object.keys(recorded.prompts)).toHaveLength(2);
    expect(recorded.runs.map((run) => run.seeds)).toEqual([[1], [2], [3]]);
  });

  it('開始時刻が既に記録にある実行は足さない。足すものが無ければ同じファイルを返す', () => {
    const first = file([source('a', 1_000, ['a.png'])]);
    const again = addRuns({
      file: first,
      sources: [source('a', 1_000, ['a.png'])],
      definitions: DEFINITIONS,
      kinds: OPTIONS,
      names: NO_NAMES,
    });

    expect(again).toBe(first);
  });

  it('完了時刻の無い実行（版 1）には、分かったときに完了時刻を足す', () => {
    const first = file([source('a', 1_000, ['a.png'])]);
    const old = { ...first, runs: first.runs.map((run) => ({ ...run, end: null })) };
    const filled = addRuns({
      file: old,
      sources: [source('a', 1_000, ['a.png'])],
      definitions: DEFINITIONS,
      kinds: OPTIONS,
      names: NO_NAMES,
    });

    expect(filled.runs[0]?.end).toBe(2_000);
  });

  it('この画面から送った実行には名前を付ける', () => {
    const recorded = file([source('a', 1_000, ['a.png'])], new Map([['a', 'portrait']]));

    expect(Object.values(recorded.workflows)[0]?.name).toBe('portrait');
  });

  it('ほかの画面が名前なしで先に書いた実行には、名前の分かる画面が名前を足す', () => {
    const unnamed = file([source('a', 1_000, ['a.png'])]);
    const named = addRuns({
      file: unnamed,
      sources: [source('a', 1_000, ['a.png'])],
      definitions: DEFINITIONS,
      kinds: OPTIONS,
      names: new Map([['a', 'portrait']]),
    });

    expect(named.runs).toHaveLength(1);
    expect(Object.values(named.workflows)[0]?.name).toBe('portrait');
  });

  it('送った画面は、別の画面が /history の値で先に書いた実行を書き直し、使われない分を外す', () => {
    const other = file([source('a', 1_000, ['a.png'], sentWorkflow({ text: 'x', id: 'b' }))]);
    const sent = { ...source('a', 1_000, ['a.png'], sentWorkflow({ text: 'a' })), sent: true };
    const fixed = addRuns({
      file: other,
      sources: [sent],
      definitions: DEFINITIONS,
      kinds: OPTIONS,
      names: NO_NAMES,
    });

    expect(fixed.runs).toHaveLength(1);
    expect(Object.values(fixed.prompts)).toEqual([['a']]);
    expect(Object.keys(fixed.workflows)).toHaveLength(1);
    expect(
      addRuns({
        file: fixed,
        sources: [sent],
        definitions: DEFINITIONS,
        kinds: OPTIONS,
        names: NO_NAMES,
      }),
    ).toBe(fixed);
  });

  it('Workflow JSON が無い実行はパスと時刻だけを残す', () => {
    const recorded = file([source('a', 1_000, ['a.png'], null)]);

    expect(recorded.runs[0]).toMatchObject({ workflow: null, prompt: null, end: 2_000 });
  });
});

describe('buildHistoryCards', () => {
  const cardsOf = (...files: Parameters<typeof file>[0][]) =>
    buildHistoryCards(
      files.map(
        (sources, index) =>
          [`f${String(index)}.json`, file(sources, new Map([['a', 'portrait']]))] as const,
      ),
    );

  it('セッション（記録のファイル）1 つを 1 枚にする。時間・ワークフロー・モデルでは分けない', () => {
    const cards = cardsOf([
      source('a', 1_000, ['x/a.png'], sentWorkflow({ text: 'cat' })),
      source('b', 900_000, ['b.png'], sentWorkflow({ id: 'wf-b', model: 'other.safetensors' })),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      key: 'f0.json',
      name: null,
      workflowName: 'portrait',
    });
    expect(cards[0] === undefined ? '' : historySessionTitle(cards[0])).toBe('f0');
  });

  it('記録のファイル（セッション）が違えば、同時に実行していても別のカードにする', () => {
    const cards = cardsOf(
      [source('a', 1_000, []), source('b', 5_000, [])],
      [source('c', 2_000, []), source('d', 6_000, [])],
    );

    expect(cards.map((card) => card.runs.length)).toEqual([2, 2]);
  });

  it('カードの名前はセッション名を先に使う', () => {
    const named = { ...file([source('a', 1_000, [])]), name: 'morning batch' };

    const [card] = buildHistoryCards([['f.json', named]]);
    expect(card?.name).toBe('morning batch');
    expect(card === undefined ? '' : historySessionTitle(card)).toBe('morning batch');
  });

  it('ビューワーに渡す並びは新しい実行から、サブフォルダを分けて出す', () => {
    const [card] = cardsOf([source('a', 1_000, ['x/a.png']), source('b', 2_000, ['b.png'])]);
    if (card === undefined) throw new Error('no card');

    const tasks = historyTasks(card);
    expect(tasks.map((task) => task.outputs[0]?.filename)).toEqual(['b.png', 'a.png']);
    expect(tasks[1]?.outputs[0]).toEqual({ filename: 'a.png', subfolder: 'x', type: 'output' });
  });

  it('記録にはモデル・プロンプト・シードの置き場だけを残す', () => {
    const run = cardsOf([source('a', 1_000, [], sentWorkflow({ seed: 3, text: 'cat' }))])[0]
      ?.runs[0];
    if (run === undefined) throw new Error('no run');

    expect(Object.keys(run.entry).sort()).toEqual(
      ['lora', 'model', 'name', 'nodes', 'other', 'prompts', 'seeds'].sort(),
    );
    expect(run.entry.seeds).toEqual([['1', 'seed']]);
    expect(run.entry.prompts).toEqual([['2', 'text', null]]);
    expect(run.entry.nodes).toEqual({ '1': ['Sampler'], '2': ['Text'] });
    expect(run.seeds).toEqual([3]);
  });

  it('カードの中のプロンプトの番号は、古く使われた順に振る', () => {
    const [card] = cardsOf([
      source('a', 1_000, [], sentWorkflow({ text: 'x' })),
      source('b', 2_000, [], sentWorkflow({ text: 'y' })),
      source('c', 3_000, [], sentWorkflow({ text: 'x' })),
    ]);
    if (card === undefined) throw new Error('no card');

    const numbers = promptNumbers(card);
    expect(card.runs.map((run) => numbers.get(run.prompt))).toEqual([1, 2, 1]);
  });
});

describe('履歴の詳細の材料', () => {
  it('記録の置き場と実行ごとの値から、プロンプトとシードの欄を作る', () => {
    const run = buildHistoryCards([
      ['f.json', file([source('b', 2_000, [], sentWorkflow({ seed: 2, text: 'dog' }))])],
    ])[0]?.runs[0];
    if (run === undefined) throw new Error('no run');

    const detail = runDetail(run);
    expect(detail.prompts.map((prompt) => [prompt.nodeId, prompt.text])).toEqual([['2', 'dog']]);
    expect(detail.seeds).toMatchObject([{ nodeId: '1', input: 'seed', value: 2 }]);
  });
});

describe('さかのぼる範囲', () => {
  const entries = [
    { name: 'tab-b.json', modified: 9_000 },
    { name: 'tab-a.json', modified: 1_000 },
    { name: 'tab-c.json', modified: 30_000 },
    { name: 'tab-x.json', modified: null },
  ];

  it('時期の古い順に並べる。時期の分からないものは先頭（一番古い扱い）', () => {
    expect(sessionNames(entries)).toEqual(['tab-x.json', 'tab-a.json', 'tab-b.json', 'tab-c.json']);
  });

  it('選んだファイルとそれより前に書かれたファイルを新しい順に返し、選んでいない・無いなら全部', () => {
    const names = sessionNames(entries);
    expect(namesUpTo(names, 'tab-b.json')).toEqual(['tab-b.json', 'tab-a.json', 'tab-x.json']);
    expect(namesUpTo(names, null)).toHaveLength(4);
    expect(namesUpTo(names, 'gone.json')).toHaveLength(4);
  });
});

describe('モデルの区分', () => {
  it('種別の一覧でモデル・LoRA・その他に分ける', () => {
    expect(modelKindOf('base.safetensors', 'x', OPTIONS)).toBe('model');
    expect(modelKindOf('style.safetensors', 'x', OPTIONS)).toBe('lora');
    expect(modelKindOf('vae.safetensors', 'ckpt_name', OPTIONS)).toBe('other');
  });

  it('一覧が無ければ入力名で分ける（lora → LoRA、vae・clip・encoder → その他、ほか → モデル）', () => {
    const none = { modelNames: new Set<string>(), loraNames: new Set<string>() };
    expect(modelKindOf('a.safetensors', 'lora_name', none)).toBe('lora');
    expect(modelKindOf('a.safetensors', 'vae_name', none)).toBe('other');
    expect(modelKindOf('a.safetensors', 'clip_name1', none)).toBe('other');
    expect(modelKindOf('a.safetensors', 'unet_name', none)).toBe('model');
  });

  it('プロンプトには、positive / negative 入力の上流をさかのぼった役割を書く', () => {
    const definitions = definitionMap(
      definition('Cond', [socket('positive', 'COND'), socket('negative', 'COND')], {
        outputNode: true,
      }),
      definition('Encode', [widget('text', 'STRING', { multiline: true })], {
        outputs: [{ name: 'COND', type: 'COND' }],
      }),
    );
    const encode = (id: number, text: string, link: number) => ({
      id,
      type: 'Encode',
      pos: [0, 0],
      outputs: [{ name: 'COND', type: 'COND', links: [link] }],
      widgets_values: [text],
    });
    const workflow = {
      nodes: [
        {
          id: 1,
          type: 'Cond',
          pos: [0, 0],
          inputs: [
            { name: 'positive', type: 'COND', link: 1 },
            { name: 'negative', type: 'COND', link: 2 },
          ],
        },
        encode(2, 'cat', 1),
        encode(3, 'blurry', 2),
      ],
      links: [
        [1, 2, 0, 1, 0, 'COND'],
        [2, 3, 0, 1, 1, 'COND'],
      ],
    };
    const recorded = addRuns({
      file: EMPTY_RUN_HISTORY,
      sources: [source('a', 1_000, [], workflow)],
      definitions,
      kinds: OPTIONS,
      names: NO_NAMES,
    });

    const entry = Object.values(recorded.workflows)[0];
    expect(entry?.prompts.map((slot) => [slot[0], slot[2]])).toEqual([
      ['2', 'posi'],
      ['3', 'nega'],
    ]);
  });

  it('文章が空のプロンプト（展開前の空の欄など）は欄に出さない', () => {
    const run = buildHistoryCards([
      ['f.json', file([source('b', 2_000, [], sentWorkflow({ text: '' }))])],
    ])[0]?.runs[0];
    if (run === undefined) throw new Error('no run');

    expect(runDetail(run).prompts).toEqual([]);
  });

  it('実行で使ったモデルファイルを、書いたときの区分ごとに返す', () => {
    const run = buildHistoryCards([['f.json', file([source('a', 1_000, [])])]])[0]?.runs[0];
    if (run === undefined) throw new Error('no run');

    expect(runDetail(run).models).toEqual({
      model: ['base.safetensors'],
      lora: ['detail.safetensors', 'style.safetensors'],
      other: [],
    });
  });
});

describe('履歴の詳細のセッションの 1 行', () => {
  const card = (name: string | null): HistoryCard => ({
    key: 'ab12cd34.json',
    name,
    workflowName: null,
    runs: [],
  });

  it('名前が無ければ UI のタブの id、あれば名前と括弧書きの id', () => {
    expect(formatHistorySession(card(null))).toBe('session: ab12cd34');
    expect(formatHistorySession(card('猫'))).toBe('猫（ab12cd34）');
  });
});
