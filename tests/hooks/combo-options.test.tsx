// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NodeRow, NodeView } from '@/graph/rows';
import { useComboOptions } from '@/hooks/flow/use-combo-options';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { nodeRow, nodeView } from '../helpers/views';

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ baseUrl: '' });
});

function comboRow(overrides: Partial<NodeRow> = {}): NodeRow {
  return nodeRow({
    name: 'lora_name',
    label: 'lora_name',
    type: 'COMBO',
    value: '',
    target: { kind: 'node', nodeId: 1, classType: 'LoraLoader' },
    widgetName: 'lora_name',
    ...overrides,
  });
}

function view(rows: readonly NodeRow[]): NodeView {
  return nodeView({ displayName: 'Load LoRA', classType: 'LoraLoader', rows });
}

describe('選択肢の取り寄せ', () => {
  it('未取得のクラスを 1 つずつ取りに行く', () => {
    const ensureOptions = vi.fn<(baseUrl: string, className: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    useDefinitionsStore.setState({ ensureOptions });
    useSettingsStore.setState({ baseUrl: 'http://x' });

    const rows = [
      comboRow(),
      comboRow({ target: { kind: 'node', nodeId: 2, classType: 'CheckpointLoaderSimple' } }),
      comboRow({ options: ['a.safetensors'] }),
      comboRow({ target: null }),
    ];
    renderHook(() => useComboOptions([view(rows)]));

    expect(ensureOptions.mock.calls.map((call) => call[1])).toEqual([
      'CheckpointLoaderSimple',
      'LoraLoader',
    ]);
  });

  it('接続先が無ければ何もしない', () => {
    const ensureOptions = vi.fn<(baseUrl: string, className: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    useDefinitionsStore.setState({ ensureOptions });

    renderHook(() => useComboOptions([view([comboRow()])]));

    expect(ensureOptions).not.toHaveBeenCalled();
  });

  it('同じ顔ぶれで描き直しても取り直さない', () => {
    const ensureOptions = vi.fn<(baseUrl: string, className: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    useDefinitionsStore.setState({ ensureOptions });
    useSettingsStore.setState({ baseUrl: 'http://x' });

    const { rerender } = renderHook(() => useComboOptions([view([comboRow()])]));
    rerender();

    expect(ensureOptions).toHaveBeenCalledTimes(1);
  });
});
