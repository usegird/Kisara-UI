// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NodeRow } from '@/graph/rows';
import { scopedId } from '@/graph/subgraph-level';
import { useSubfolderFixes } from '@/hooks/flow/use-subfolder-fixes';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useTabsStore } from '@/store/use-tabs-store';

import { nodeRow, nodeView } from '../helpers/views';

const commitValue = vi.hoisted(() => vi.fn((_row: NodeRow, _value: unknown) => undefined));
vi.mock('@/hooks/flow/use-row-editing', () => ({
  useRowEditing: () => ({ commitValue, resizeText: vi.fn(), needOptions: vi.fn() }),
}));

const TARGET = { kind: 'node', nodeId: 3, classType: 'AnyLoader' } as const;
const OPTIONS = ['flux/a.safetensors', 'b.safetensors'];

function viewWith(value: string, id = 3) {
  const row = nodeRow({ type: 'COMBO', value, options: OPTIONS, target: TARGET, widgetName: 'f' });
  return nodeView({ id, rows: [row] });
}

afterEach(() => {
  cleanup();
  commitValue.mockClear();
  useRunReportStore.setState({ folderFixes: [] });
});

describe('サブフォルダの名前への書き換え', () => {
  it('書き換えて注意を残し、書き換えた値になったら二度は書かない', () => {
    useTabsStore.setState({ activeId: 'w' });
    const { rerender } = renderHook(({ views }) => useSubfolderFixes(views), {
      initialProps: { views: [viewWith('a.safetensors')] },
    });

    expect(commitValue).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'flux/a.safetensors');
    expect(useRunReportStore.getState().folderFixes).toEqual([
      { tabId: 'w', promptNodeId: '3', widgetName: 'f', to: 'flux/a.safetensors' },
    ]);

    rerender({ views: [viewWith('flux/a.safetensors')] });
    expect(commitValue).toHaveBeenCalledOnce();
  });

  it('開いた subgraph の中のカードは、実行の形の id で残す', () => {
    useTabsStore.setState({ activeId: 'w' });
    renderHook(() => useSubfolderFixes([viewWith('a.safetensors', scopedId(12, 34))]));

    expect(useRunReportStore.getState().folderFixes[0]?.promptNodeId).toBe('12:34');
  });
});
