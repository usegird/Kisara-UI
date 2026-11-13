import { describe, expect, it } from 'vitest';

import type { NodeView } from '@/graph/rows';
import { nodeProgress, runningNodeLabel } from '@/queue/running-node';

import { nodeView } from '../helpers/views';

// ─────────────────────────────
// 実行中ノードの表示。WebSocket が返すのは**平坦化後の id**（subgraph 内は `12:34`）なので、
// カードに戻して「通番 + コメント/ノード名」にする。
// ─────────────────────────────

function view(id: number, index: number | null, displayName: string, comment = ''): NodeView {
  return nodeView({ id, index: index === null ? null : String(index), displayName, comment });
}

const views = [view(3, 1, 'KSampler'), view(12, 2, 'Save Image', '出力')];

describe('実行中ノードの表示', () => {
  it('通番とノード名を返す', () => {
    expect(runningNodeLabel(views, '3')).toEqual({ index: '1', name: 'KSampler' });
  });

  it('コメントがあればコメントを出す', () => {
    expect(runningNodeLabel(views, '12')).toEqual({ index: '2', name: '出力' });
  });

  it('subgraph 内のノードは先頭の区間でカードに戻す', () => {
    expect(runningNodeLabel(views, '12:70')).toEqual({ index: '2', name: '出力' });
  });

  it('カードが見つからなくても id は出す（黙って消さない）', () => {
    expect(runningNodeLabel(views, '99')).toEqual({ index: null, name: '#99' });
  });

  it('実行中でなければ何も出さない', () => {
    expect(runningNodeLabel(views, null)).toBeNull();
  });
});

describe('ノードの進み具合', () => {
  it('終わった数と全体数を数える（error も終わり扱い）', () => {
    expect(nodeProgress({ '1': 'finished', '2': 'running', '3': 'pending', '4': 'error' })).toEqual(
      { finished: 2, total: 4 },
    );
  });

  it('まだ何も来ていなければ null', () => {
    expect(nodeProgress({})).toBeNull();
  });
});
