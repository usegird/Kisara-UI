import { describe, expect, it } from 'vitest';

import { buildRunReport, reportAlert, type RunReportInput } from '@/queue/run-report';

import { nodeView } from '../helpers/views';

const NONE: RunReportInput = {
  missing: [],
  diagnostics: [],
  rejection: null,
  forbidden: null,
  error: null,
  unknown: false,
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
    const model = {
      name: 'a.safetensors',
      directory: 'vae',
      url: null,
      linkable: false,
    };
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

  it('subgraph の中のノードは外側のカードにまとめ、内側の id を添える', () => {
    const report = buildRunReport({ ...NONE, error: { node: '7:12', message: 'OOM' } }, views);

    expect(report.nodes[0]?.name).toBe('ワイルドカード');
    expect(report.nodes[0]?.lines[0]?.text).toBe('（内側 #12）OOM');
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
