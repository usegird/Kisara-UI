import { beforeEach, describe, expect, it } from 'vitest';

import {
  installDemoDefinitions,
  openDemoFile,
  openDemoSample,
  resetDemoView,
} from '@/demo/demo-data';
import { DEFAULT_COLUMN_WIDTHS } from '@/store/settings-fields/column-widths';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { png, textChunk } from '../helpers/png';

// ─────────────────────────────
// 公開用のデモ。埋め込んだ定義で見本が描け、通信の要る欄が残らないこと
// ─────────────────────────────

beforeEach(() => installDemoDefinitions());

describe('installDemoDefinitions', () => {
  it('見本のノードの型はすべて定義がある', () => {
    openDemoSample();
    const { definitions } = useDefinitionsStore.getState();
    const types = new Set(useGraphStore.getState().workflow?.nodes.map((node) => node.type));
    expect([...types].filter((type) => !definitions.has(type))).toEqual([]);
  });

  it('選択肢を落とさない（欄を開いても接続先へ取りに行かない）', () => {
    const { definitions } = useDefinitionsStore.getState();
    const missing = [...definitions.values()].flatMap((definition) =>
      definition.inputs.filter((input) => input.type === 'COMBO' && input.options === null),
    );
    expect(missing).toEqual([]);
  });
});

describe('openDemoFile', () => {
  it('JSON を開いて今の画面を置き換える', async () => {
    openDemoSample();
    const json = JSON.stringify({ nodes: [], links: [] });
    await openDemoFile(new File([json], 'mine.json'));
    expect(useGraphStore.getState().workflow?.nodes).toHaveLength(0);
  });

  it('ワークフローの無い画像は断る', async () => {
    const file = new File([png(textChunk('parameters', 'x'))], 'only-text.png');
    await expect(openDemoFile(file)).rejects.toThrow('ワークフローが入っていません');
  });
});

describe('resetDemoView', () => {
  it('列の幅と、変数の線を通す余白をデモの既定に戻す', () => {
    useSettingsStore.setState({ columnWidths: { ...DEFAULT_COLUMN_WIDTHS, app: 10 } });
    resetDemoView();
    const { columnWidths } = useSettingsStore.getState();
    expect(columnWidths.app).toBe(336);
    expect(columnWidths.variablesGap).toBe(156);
    expect(columnWidths.variables).toBe(255);
    expect(columnWidths.cards).toBe(457);
  });
});
