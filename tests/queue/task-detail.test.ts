import { describe, expect, it } from 'vitest';

import { parsePromptNodes, parseRunFailure } from '@/comfy/schema';
import {
  classifyRoles,
  extractSettings,
  extractTaskSummary,
  groupModels,
  mergeNodeRows,
  nodeDurations,
} from '@/queue/task-detail';
import {
  dependencyOrder,
  failureTrace,
  formatTaskFailure,
  nodeLabeler,
} from '@/queue/task-failure';

import { definition, definitionMap, widget } from '../helpers/definitions';

const definitions = definitionMap(
  definition('Loader', [widget('ckpt_name', 'COMBO')]),
  definition('Encode', [widget('text', 'STRING', { multiline: true })]),
  definition('Save', [widget('filename_prefix', 'STRING')]),
);

describe('実行内容の要約', () => {
  const nodes = parsePromptNodes({
    '1': { class_type: 'Loader', inputs: { ckpt_name: 'anime/stein.safetensors' } },
    '2': { class_type: 'Encode', inputs: { text: '1girl, smile', clip: ['1', 1] } },
    '3': { class_type: 'Save', inputs: { filename_prefix: 'output' } },
    '4': { class_type: 'Unknown', inputs: { lora: 'detail.safetensors' } },
  });

  it('モデルは拡張子で拾う（定義が無いノードも）', () => {
    expect(extractTaskSummary(nodes, definitions).models).toEqual([
      { file: 'anime/stein.safetensors', input: 'ckpt_name' },
      { file: 'detail.safetensors', input: 'lora' },
    ]);
  });

  it('モデルを区分（モデル・LoRA・その他）に分ける。一覧が無ければ入力名で', () => {
    const none = { modelNames: new Set<string>(), loraNames: new Set<string>() };
    const uses = [
      { file: 'b.safetensors', input: 'unet_name' },
      { file: 'v.safetensors', input: 'vae_name' },
      { file: 'l.safetensors', input: 'lora_name' },
    ];

    expect(groupModels(uses, none)).toEqual({
      model: ['b.safetensors'],
      lora: ['l.safetensors'],
      other: ['v.safetensors'],
    });
  });

  it('プロンプトは定義の multiline で拾う', () => {
    expect(extractTaskSummary(nodes, definitions).prompts).toEqual([
      { nodeId: '2', classType: 'Encode', inputName: 'text', text: '1girl, smile', role: null },
    ]);
  });

  it('リンク（配列）や数値は拾わない', () => {
    const linked = parsePromptNodes({
      '1': { class_type: 'Encode', inputs: { text: ['9', 0], steps: 20 } },
    });

    expect(extractTaskSummary(linked, definitions)).toEqual({ models: [], prompts: [] });
  });

  it('class_type が無いものは落とす', () => {
    expect(parsePromptNodes({ '1': { inputs: {} }, '2': 42 }).size).toBe(0);
  });
});

describe('ポジ／ネガの分類', () => {
  const sampler = parsePromptNodes({
    '1': { class_type: 'Loader', inputs: { ckpt_name: 'a.safetensors' } },
    '2': { class_type: 'Encode', inputs: { text: 'good', clip: ['1', 1] } },
    '3': { class_type: 'Encode', inputs: { text: 'bad', clip: ['1', 1] } },
    '4': { class_type: 'Sampler', inputs: { positive: ['2', 0], negative: ['3', 0] } },
  });

  it('入力名 positive / negative の上流をたどって分類する', () => {
    const roles = classifyRoles(sampler);

    expect(roles.get('2')).toBe('positive');
    expect(roles.get('3')).toBe('negative');
  });

  it('間にノードを挟んでも届く', () => {
    const combined = parsePromptNodes({
      '2': { class_type: 'Encode', inputs: { text: 'good' } },
      '5': { class_type: 'Combine', inputs: { a: ['2', 0] } },
      '4': { class_type: 'Sampler', inputs: { positive: ['5', 0] } },
    });

    expect(classifyRoles(combined).get('2')).toBe('positive');
  });

  it('番号つき・短縮形の入力名も見る（positive_1 / neg など）', () => {
    const variants = parsePromptNodes({
      '2': { class_type: 'Encode', inputs: { text: 'good' } },
      '3': { class_type: 'Encode', inputs: { text: 'bad' } },
      '4': { class_type: 'Sampler', inputs: { positive_1: ['2', 0], neg: ['3', 0] } },
    });
    const roles = classifyRoles(variants);

    expect(roles.get('2')).toBe('positive');
    expect(roles.get('3')).toBe('negative');
  });

  it('役割を表さない conditioning は分類しない', () => {
    const neutral = parsePromptNodes({
      '2': { class_type: 'Encode', inputs: { text: 'x' } },
      '4': { class_type: 'Apply', inputs: { conditioning: ['2', 0] } },
    });

    expect(classifyRoles(neutral).size).toBe(0);
  });

  it('両方から辿れるものは分類しない（推測で決めない）', () => {
    const shared = parsePromptNodes({
      '2': { class_type: 'Encode', inputs: { text: 'both' } },
      '4': { class_type: 'Sampler', inputs: { positive: ['2', 0], negative: ['2', 0] } },
    });

    expect(classifyRoles(shared).has('2')).toBe(false);
  });

  it('要約ではポジ → ネガ → 未分類の順に並ぶ', () => {
    const withRoles = parsePromptNodes({
      '2': { class_type: 'Encode', inputs: { text: 'good' } },
      '3': { class_type: 'Encode', inputs: { text: 'bad' } },
      '6': { class_type: 'Encode', inputs: { text: 'memo' } },
      '4': { class_type: 'Sampler', inputs: { positive: ['2', 0], negative: ['3', 0] } },
    });

    expect(extractTaskSummary(withRoles, definitions).prompts.map((p) => [p.text, p.role])).toEqual(
      [
        ['good', 'positive'],
        ['bad', 'negative'],
        ['memo', null],
      ],
    );
  });
});

describe('設定の一覧', () => {
  const nodes = parsePromptNodes({
    '9': {
      class_type: 'Sampler',
      inputs: {
        seed: 779488563616170,
        steps: 8,
        cfg: 1.5,
        sampler_name: 'er_sde',
        add_noise: true,
        model: ['1', 0],
        positive: ['2', 0],
      },
    },
    '1': { class_type: 'Loader', inputs: { ckpt_name: 'a.safetensors' } },
    '2': { class_type: 'Encode', inputs: { text: 'とても長い'.repeat(30) } },
  });

  it('数値・真偽・短い文字列を、ノード id 順に出す', () => {
    expect(extractSettings(nodes, definitions)).toEqual([
      {
        nodeId: '9',
        classType: 'Sampler',
        values: [
          { name: 'seed', text: '779488563616170' },
          { name: 'steps', text: '8' },
          { name: 'cfg', text: '1.5' },
          { name: 'sampler_name', text: 'er_sde' },
          { name: 'add_noise', text: 'true' },
        ],
      },
    ]);
  });

  it('モデル名・プロンプト・リンクは出さない（別の欄で出すため）', () => {
    const listed = extractSettings(nodes, definitions).flatMap((node) =>
      node.values.map((value) => value.name),
    );

    expect(listed).not.toContain('ckpt_name');
    expect(listed).not.toContain('text');
    expect(listed).not.toContain('model');
  });
});

describe('ノードごとの所要時間', () => {
  it('順番どおりに並び、終わっていない区間は不明', () => {
    expect(
      nodeDurations([
        { nodeId: '3', startedAt: 1_000, endedAt: 2_500 },
        { nodeId: '12', startedAt: 2_500, endedAt: null },
      ]),
    ).toEqual([
      { nodeId: '3', durationMs: 1_500 },
      { nodeId: '12', durationMs: null },
    ]);
  });
});

describe('設定と所要時間のまとめ', () => {
  const settings = [
    { nodeId: '9', classType: 'Sampler', values: [{ name: 'steps', text: '8' }] },
    { nodeId: '1', classType: 'Loader', values: [{ name: 'device', text: 'default' }] },
  ];

  it('時刻があるものは実行順、無いものは後ろ', () => {
    const rows = mergeNodeRows(settings, [{ nodeId: '9', durationMs: 4200 }]);

    expect(rows.map((row) => [row.nodeId, row.order, row.durationMs])).toEqual([
      ['9', 1, 4200],
      ['1', null, null],
    ]);
    expect(rows[1]?.values).toEqual([{ name: 'device', text: 'default' }]);
  });

  it('同じノードが複数回動いたら合算し、順番は最初の位置', () => {
    const rows = mergeNodeRows(settings, [
      { nodeId: '9', durationMs: 1000 },
      { nodeId: '1', durationMs: 500 },
      { nodeId: '9', durationMs: 250 },
    ]);

    expect(rows.map((row) => [row.nodeId, row.order, row.durationMs])).toEqual([
      ['9', 1, 1250],
      ['1', 2, 500],
    ]);
  });

  it('設定を持たないノードも実行順には出す', () => {
    const rows = mergeNodeRows([], [{ nodeId: '42', durationMs: 100 }]);

    expect(rows).toEqual([
      { nodeId: '42', classType: null, order: 1, durationMs: 100, values: [] },
    ]);
  });

  it('時刻が無ければ設定だけを並べる', () => {
    expect(mergeNodeRows(settings, []).map((row) => row.order)).toEqual([null, null]);
  });
});

const failedNodes = parsePromptNodes({
  '1': { class_type: 'Loader', inputs: {} },
  '2': { class_type: 'Encode', inputs: { clip: ['1', 0] } },
  '3': { class_type: 'Empty', inputs: {} },
  '4': { class_type: 'Sampler', inputs: { positive: ['2', 0], latent: ['3', 0] } },
  '5': { class_type: 'Save', inputs: { images: ['4', 0] } },
});

function failedEntry(type = 'execution_error'): unknown {
  return {
    status: {
      status_str: 'error',
      messages: [
        ['execution_start', { prompt_id: 'p', timestamp: 1 }],
        ['execution_cached', { nodes: ['1'], prompt_id: 'p', timestamp: 2 }],
        [
          type,
          {
            node_id: '4',
            node_type: 'Sampler',
            executed: ['3', '2'],
            exception_message: 'CUDA out of memory\nTried to allocate 2 GiB',
            exception_type: 'torch.OutOfMemoryError',
            traceback: ['  File "a.py", line 1\n', '  File "b.py", line 2\n'],
            current_inputs: { steps: [20], latent: ['torch.Size([1, 4, 64, 64])'] },
            timestamp: 3,
          },
        ],
      ],
    },
  };
}

describe('失敗の記録', () => {
  it('履歴の 1 件から止まったノード・例外・入力・動いたノードを取り出す', () => {
    const failure = parseRunFailure(failedEntry());

    expect(failure?.kind).toBe('error');
    expect(failure?.nodeId).toBe('4');
    expect(failure?.exceptionType).toBe('torch.OutOfMemoryError');
    expect(failure?.inputs).toContainEqual({ name: 'steps', values: ['20'] });
    expect(failure?.cached).toEqual(['1']);
  });

  it('成功した・記録の無い応答は null', () => {
    expect(parseRunFailure({ status: { status_str: 'success', messages: [] } })).toBeNull();
    expect(parseRunFailure({})).toBeNull();
    expect(parseRunFailure(null)).toBeNull();
  });

  it('中断は失敗と分ける', () => {
    expect(parseRunFailure(failedEntry('execution_interrupted'))?.kind).toBe('interrupted');
  });
});

describe('そこまでの処理', () => {
  const failure = parseRunFailure(failedEntry());
  if (failure === null) throw new Error('fixture');

  it('見ていなければ線のつながりから並べ、キャッシュと動かなかった数を分ける', () => {
    const trace = failureTrace(failure, failedNodes, []);

    expect(trace.orderedBy).toBe('dependency');
    expect(trace.steps.map((step) => step.nodeId)).toEqual(['2', '3']);
    expect(trace.cached.map((step) => step.nodeId)).toEqual(['1']);
    expect(trace.notRun).toBe(1);
  });

  it('見ていた実行なら通知の順に並べる', () => {
    const timings = [
      { nodeId: '3', startedAt: 0, endedAt: 1 },
      { nodeId: '2', startedAt: 1, endedAt: 2 },
      { nodeId: '4', startedAt: 2, endedAt: null },
    ];
    const trace = failureTrace(failure, failedNodes, timings);

    expect(trace.orderedBy).toBe('observed');
    expect(trace.steps.map((step) => step.nodeId)).toEqual(['3', '2']);
  });

  it('依存の順は上流が先。同じ段は id の順', () => {
    expect(dependencyOrder(['5', '4', '2', '1', '3'], failedNodes)).toEqual([
      '1',
      '3',
      '2',
      '4',
      '5',
    ]);
  });

  it('写し取りの文字に、止まったノード・例外・処理・入力・トレースバックを入れる', () => {
    const text = formatTaskFailure(failure, failureTrace(failure, failedNodes, []));

    expect(text).toContain('止まったノード: #4 Sampler');
    expect(text).toContain('Tried to allocate 2 GiB');
    expect(text).toContain('1. #2 Encode');
    expect(text).toContain('latent: torch.Size([1, 4, 64, 64])');
    expect(text).toContain('File "b.py", line 2');
  });
});

describe('ノードの表記', () => {
  const label = nodeLabeler({ '4': '3 サンプラー' });

  it('控えがあればカードの表記、subgraph の内側は id を添える', () => {
    expect(label('4', 'KSampler')).toBe('#3 サンプラー');
    expect(label('4:12', 'KSampler')).toBe('#3 サンプラー（内側 #12）');
  });

  it('控えが無ければ id とクラス名', () => {
    expect(label('9', 'SaveImage')).toBe('#9 SaveImage');
    expect(nodeLabeler(undefined)('4', null)).toBe('#4 （不明）');
  });
});
