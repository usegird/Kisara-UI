import { describe, expect, it } from 'vitest';

import type { WorkflowModel } from '@/graph/missing-models';
import type { Workflow } from '@/graph/types';
import {
  buildRunReport,
  innerHeadingOf,
  lastRunFailureOf,
  reportAlert,
  reportLineKey,
  withoutDismissed,
  type RunReportInput,
} from '@/queue/run-report';

import { definition, definitionMap } from '../helpers/definitions';
import { historyEntry, TEST_SESSION } from '../helpers/queue';
import { nodeView } from '../helpers/views';
import { bareNode } from '../helpers/workflow';

const NONE: RunReportInput = {
  missing: [],
  diagnostics: [],
  rejection: null,
  forbidden: null,
  error: null,
  unknown: false,
};

const MODEL: WorkflowModel = {
  promptNodeId: '4',
  name: 'a.safetensors',
  selected: 'a.safetensors',
  directory: 'vae',
  url: null,
  linkable: false,
  disabled: false,
};

const views = [
  nodeView({ id: 4, index: '1', displayName: 'Loader' }),
  nodeView({ id: 7, index: '2', displayName: 'Encode', comment: 'ワイルドカード' }),
];

describe('エラーの一覧', () => {
  it('何も無ければ 0 件', () => {
    expect(buildRunReport(NONE, views).total).toBe(0);
  });

  it('足りないモデルはそのノードに出し、無効化していれば注意に下げる', () => {
    const model = { ...MODEL, elsewhere: null };
    const report = buildRunReport(
      {
        ...NONE,
        missingModels: [
          { ...model, promptNodeId: '4', disabled: false },
          { ...model, promptNodeId: '7:3', disabled: true },
        ],
      },
      views,
    );
    expect(report.nodes.map((node) => [node.key, node.lines[0]?.tone])).toEqual([
      ['4', 'error'],
      ['7', 'warning'],
    ]);
    expect(report.nodes[0]?.lines[0]?.model?.directory).toBe('vae');
    expect(report.nodes[0]?.lines[0]?.text).toBe('a.safetensorsが接続先に見つかりませんでした');
  });

  it('欄をサブフォルダの名前に書き換えたら、そのノードに注意を出す', () => {
    const report = buildRunReport(
      { ...NONE, folderFixes: [{ promptNodeId: '4', to: 'flux/a.safetensors' }] },
      views,
    );

    expect(report.nodes[0]?.lines[0]).toEqual({
      tone: 'warning',
      text: 'ルートディレクトリに存在しなかったため、flux/a.safetensorsに変更しました',
    });
    expect(report.errors).toBe(0);
  });

  it('別のフォルダに同じ名前があれば、選び直しを示して取得先は添えない', () => {
    const report = buildRunReport(
      { ...NONE, missingModels: [{ ...MODEL, elsewhere: 'sub/a.safetensors' }] },
      views,
    );
    const line = report.nodes[0]?.lines[0];
    expect(line?.text).toContain('sub/a.safetensors');
    expect(line?.model).toBeUndefined();
  });

  it('断られた理由に名指しのモデルの名前が出ていれば取得先を添え、出ていなければ添えない', () => {
    const report = buildRunReport(
      {
        ...NONE,
        namedModels: [MODEL],
        rejection: {
          reason: 'Prompt outputs failed validation',
          nodes: { '4': ["Value not in list: vae_name: 'a.safetensors' not in []", 'other'] },
        },
      },
      views,
    );
    const lines = report.nodes[0]?.lines ?? [];
    expect(lines.map((line) => line.model?.name)).toEqual(['a.safetensors', undefined]);
  });

  it('外側の欄から値を受けた入力が断られたら、外側のカードで欄の名前を添えて出す', () => {
    const report = buildRunReport(
      {
        ...NONE,
        rejection: {
          reason: 'Prompt outputs failed validation',
          nodes: { '7:16': ['too big', 'other'] },
          inputs: { '7:16': ['max_length', null] },
        },
      },
      views,
      () => null,
      (promptNodeId, inputName) =>
        promptNodeId === '7:16' && inputName === 'max_length'
          ? { promptNodeId: '7', label: 'LLM_max_token' }
          : null,
    );

    const byIndex = report.nodes.map((node) => [node.index, node.lines.map((line) => line.text)]);
    expect(byIndex).toContainEqual(['2', ['LLM_max_token：too big', 'other']]);
  });

  it('見出しはカードと同じ「通し番号 + コメント（無ければノード名）」で、カードの順に並べる', () => {
    const report = buildRunReport(
      {
        ...NONE,
        rejection: { reason: 'Prompt outputs failed validation', nodes: { '7': ['bad'] } },
        diagnostics: [
          { code: 'unresolved-widgets', nodeId: '4', classType: 'L', message: '既定値で実行' },
        ],
      },
      views,
    );

    expect(report.nodes.map((node) => [node.index, node.name])).toEqual([
      ['1', 'Loader'],
      ['2', 'ワイルドカード'],
    ]);
    expect(report.general[0]?.text).toContain('受け付けられませんでした');
    expect(report.errors).toBe(2);
    expect(report.total).toBe(3);
    expect(reportAlert(report)).toBe('error');
  });

  it('無効化しているノードの定義が見つからないときは、実行できるので注意にする', () => {
    const report = buildRunReport(
      { ...NONE, missing: [{ nodeId: 4, classType: 'Custom', disabled: true }] },
      views,
    );

    expect(report.nodes[0]?.lines[0]?.tone).toBe('warning');
    expect(report.errors).toBe(0);
    expect(report.total).toBe(1);
    expect(reportAlert(report)).toBe('warning');
  });

  it('一時保存がほかのブラウザのタブで書き換えられていたら、全体の段に注意を出す', () => {
    const report = buildRunReport(
      { ...NONE, saveNotices: [{ kind: 'restored', name: 'portrait', time: '2026/10/10 20:00' }] },
      views,
    );

    expect(report.general).toEqual([
      {
        tone: 'warning',
        text: '「portrait」の一時保存は、ほかのブラウザのタブで書き換えられていました（2026/10/10 20:00）',
      },
    ]);
    expect(report.errors).toBe(0);
  });

  it('同じワークフローがほかのブラウザのタブでも編集されていたら、全体の段に注意を出す', () => {
    const report = buildRunReport(
      { ...NONE, saveNotices: [{ kind: 'parallel', name: 'portrait', time: '20:00' }] },
      views,
    );

    expect(report.general[0]).toEqual({
      tone: 'warning',
      text: '「portrait」は、ほかのブラウザのタブでも編集されています（最後の編集 20:00）',
    });
  });

  it('定義が見つからないノードは、変換の注意と重ねずに 1 つにする', () => {
    const report = buildRunReport(
      {
        ...NONE,
        missing: [{ nodeId: 4, classType: 'Custom' }],
        diagnostics: [{ code: 'unknown-class', nodeId: '4', classType: 'Custom', message: 'x' }],
      },
      views,
    );

    expect(report.nodes[0]?.lines).toHaveLength(1);
    expect(report.nodes[0]?.lines[0]?.text).toContain('ノード定義が見つかりません');
  });

  it('subgraph の中のノードは、見出しが引ければそのノードの番号（X.x）と名前で出し、中のノードの id は出さない', () => {
    const input = { ...NONE, error: { node: '7:12', message: 'OOM' } };
    const heading = { index: '2.3', name: 'Sampler', cardId: 7 };
    const report = buildRunReport(input, views, (id) => (id === '7:12' ? heading : null));

    expect(report.nodes[0]).toMatchObject({ index: '2.3', name: 'Sampler', cardId: 7 });
    expect(report.nodes[0]?.lines[0]?.text).toBe('OOM');
  });

  it('2 段より深い中のノードは、各段のカードの並びの順をつないだ番号で出す', () => {
    const gen = (id: number, y: number) => bareNode({ id, type: 'Gen', pos: [0, y] });
    const workflow: Workflow = {
      nodes: [bareNode({ id: 7, type: 'outer' })],
      links: [],
      definitions: {
        subgraphs: [
          {
            id: 'outer',
            name: 'O',
            links: [],
            nodes: [gen(4, 0), bareNode({ id: 3, type: 'inner', pos: [0, 100] })],
          },
          { id: 'inner', name: 'I', links: [], nodes: [gen(1, 0), gen(2, 100)] },
        ],
      },
    };
    const heading = innerHeadingOf(views, workflow, definitionMap(definition('Gen', [])), '7:3:2');

    expect(heading).toMatchObject({ index: '2.2.2', name: 'Gen', cardId: 7 });
  });

  it('見出しが引けない subgraph の中のノードは、外側のカードにまとめる', () => {
    const report = buildRunReport({ ...NONE, error: { node: '7:12', message: 'OOM' } }, views);

    expect(report.nodes[0]).toMatchObject({ index: '2', name: 'ワイルドカード' });
    expect(report.nodes[0]?.lines[0]?.text).toBe('OOM');
  });

  it('見失った実行は失敗と分ける', () => {
    const report = buildRunReport(
      { ...NONE, unknown: true, error: { node: null, message: '不明です' } },
      views,
    );

    expect(report.errors).toBe(0);
    expect(report.general[0]?.tone).toBe('muted');
  });
});

describe('閉じた件', () => {
  it('閉じた件だけを外し、件数も数え直す。件が無くなったノードは出さない', () => {
    const report = buildRunReport(
      {
        ...NONE,
        missing: [
          { nodeId: 4, classType: 'Gone' },
          { nodeId: 7, classType: 'Lost' },
        ],
      },
      views,
    );
    const first = report.nodes[0];
    if (first === undefined) throw new Error('ノードが無い');
    const key = reportLineKey(first.key, first.lines[0]!);

    const left = withoutDismissed(report, new Set([key]));
    expect(left.total).toBe(1);
    expect(left.errors).toBe(1);
    expect(left.nodes.map((node) => node.key)).toEqual(['7']);
  });
});

describe('読み込み直した後の失敗', () => {
  const failed = { kind: 'error', line: 'OOM', nodeId: '7' } as const;

  it('セッションの最後の実行が例外で終わっていれば、そのノードの失敗にする', () => {
    const history = [
      historyEntry('a', 1, { success: false, error: failed }),
      historyEntry('other', 9, { session: 'other', success: false, error: failed }),
    ];
    expect(lastRunFailureOf(history, TEST_SESSION)).toEqual({ node: '7', message: 'OOM' });
  });

  it('最後の実行が成功・中断なら出さない。セッションが無ければ出さない', () => {
    const stopped = { kind: 'interrupted', line: null, nodeId: null } as const;
    const failedFirst = [historyEntry('a', 1, { error: failed }), historyEntry('b', 2)];
    expect(lastRunFailureOf(failedFirst, TEST_SESSION)).toBeNull();
    expect(lastRunFailureOf([historyEntry('a', 1, { error: stopped })], TEST_SESSION)).toBeNull();
    expect(lastRunFailureOf([historyEntry('a', 1, { error: failed })], null)).toBeNull();
  });
});
