import { describe, expect, it } from 'vitest';

import {
  appInputDrop,
  appInputGroups,
  appInputOrder,
  droppedGroups,
  moveAppInput,
  parseAppInputDragId,
} from '@/graph/app-input-order';
import {
  applyAppValues,
  appValuesInUse,
  promptNodeIdFor,
  savedAppValues,
  withoutSavedAppValues,
  withSavedAppValues,
} from '@/graph/app-input-values';
import {
  appInputHeights,
  appInputNames,
  appInputSpans,
  dropLinkedAppInputs,
  isAppInput,
  removeAppInputs,
  setAppInputHeight,
  setAppInputSpan,
  toggleAppInput,
} from '@/graph/app-inputs';
import type { NodeRow, NodeView } from '@/graph/rows';
import type { Workflow } from '@/graph/types';

import { nodeRow, nodeView } from '../helpers/views';

// ─────────────────────────────
// App Mode（アプリ入力）の保持先は ComfyUI 本体と同じ `extra.linearData`。
// **自分が触らない要素（3要素目の config・outputs・他の extra）は必ず残す**。
// ─────────────────────────────

function workflow(extra?: unknown): Workflow {
  return {
    nodes: [{ id: 3, type: 'KSampler', pos: [0, 0] }],
    links: [],
    ...(extra === undefined ? {} : { extra }),
  };
}

describe('アプリ入力の判定', () => {
  const wf = workflow({
    ds: { scale: 1 },
    linearData: {
      inputs: [
        [3, 'seed', { width: 200 }],
        ['3', 'steps'],
        [9, 'cfg'],
      ],
      outputs: [12],
    },
  });

  it('ノードと widget 名で引ける', () => {
    expect(isAppInput(wf, 3, 'seed')).toBe(true);
    expect(isAppInput(wf, 3, 'cfg')).toBe(false);
  });

  it('id は数値でも文字列でも同じものとして扱う', () => {
    expect(isAppInput(wf, 3, 'steps')).toBe(true);
  });

  it('ノード単位の一覧を返す', () => {
    expect([...appInputNames(wf, 3)]).toEqual(['seed', 'steps']);
  });

  it('linearData が無ければ対象なし', () => {
    expect(isAppInput(workflow(), 3, 'seed')).toBe(false);
    expect(appInputNames(workflow({ ds: {} }), 3).size).toBe(0);
  });
});

describe('アプリ入力の切り替え', () => {
  it('無ければ足す', () => {
    const next = toggleAppInput(workflow(), 3, 'seed');

    expect(isAppInput(next, 3, 'seed')).toBe(true);
    expect((next.extra as { linearData: { outputs: unknown[] } }).linearData.outputs).toEqual([]);
  });

  it('あれば外す。他の項目と3要素目の設定は残す', () => {
    const wf = workflow({
      linearData: {
        inputs: [
          [3, 'seed', { width: 200 }],
          [3, 'steps'],
        ],
        outputs: [12],
      },
    });

    const next = toggleAppInput(wf, 3, 'steps');
    const data = (next.extra as { linearData: { inputs: unknown[][]; outputs: unknown[] } })
      .linearData;

    expect(data.inputs).toEqual([[3, 'seed', { width: 200 }]]);
    expect(data.outputs).toEqual([12]);
  });

  it('extra の他のキーを壊さない', () => {
    const next = toggleAppInput(workflow({ ds: { scale: 1 }, ue_links: [] }), 3, 'seed');

    expect(next.extra).toMatchObject({ ds: { scale: 1 }, ue_links: [] });
  });

  it('対象も outputs も無くなったら linearData ごと落とす', () => {
    const wf = workflow({ ds: {}, linearData: { inputs: [[3, 'seed']], outputs: [] } });
    const next = toggleAppInput(wf, 3, 'seed');

    expect(next.extra).toEqual({ ds: {} });
  });

  it('元のワークフローは書き換えない', () => {
    const wf = workflow();
    toggleAppInput(wf, 3, 'seed');

    expect(wf.extra).toBeUndefined();
  });
});

/**
 * 独自の持ち物（`extra.kisara`）を読む
 */
function own(next: Workflow): unknown {
  return (next.extra as Record<string, unknown>).kisara;
}

function linear(next: Workflow): Record<string, unknown> {
  return (next.extra as { linearData: Record<string, unknown> }).linearData;
}

describe('アプリ入力の幅', () => {
  const wf = workflow({
    linearData: { inputs: [[3, 'seed']], outputs: [5] },
    kisara: { widths: { '3:seed': 6 } },
  });

  it('12 分割の幅を読む', () => {
    expect(appInputSpans(wf).get('3:seed')).toBe(6);
  });

  it('数えられない値は指定なしとして扱う', () => {
    const broken = workflow({ kisara: { widths: { '3:steps': 'ひろい' } } });

    expect(appInputSpans(broken).size).toBe(0);
  });

  it('範囲を外れた数は端に寄せる', () => {
    const over = workflow({ kisara: { widths: { '3:seed': 0 } } });

    expect(appInputSpans(over).get('3:seed')).toBe(1);
  });

  it('幅を変えても本体の持ち物は触らない', () => {
    const next = setAppInputSpan(wf, 3, 'seed', 4);

    expect(linear(next)).toEqual({ inputs: [[3, 'seed']], outputs: [5] });
    expect(appInputSpans(next).get('3:seed')).toBe(4);
  });

  it('全幅に戻すと指定ごと消える', () => {
    // 幅を触っていないワークフローに独自の持ち物を残さない
    expect(own(setAppInputSpan(wf, 3, 'seed', 12))).toBeUndefined();
  });

  it('アプリ入力から外すと幅も消える', () => {
    expect(own(toggleAppInput(wf, 3, 'seed'))).toBeUndefined();
  });

  it('同じ幅を入れ直しても作り直さない', () => {
    expect(setAppInputSpan(wf, 3, 'seed', 6)).toBe(wf);
  });

  it('本体が linearData を作り直しても幅は残る', () => {
    const rebuilt: Workflow = {
      ...wf,
      extra: {
        ...(wf.extra as Record<string, unknown>),
        linearData: { inputs: [[3, 'seed']], outputs: [] },
      },
    };

    expect(appInputSpans(rebuilt).get('3:seed')).toBe(6);
  });
});
describe('入れた値の保存', () => {
  const wf = workflow({ linearData: { inputs: [[3, 'seed']], outputs: [] } });

  it('今もアプリ入力になっているものの値だけを書く', () => {
    const next = withSavedAppValues(
      wf,
      new Map([
        ['3', { seed: 42, steps: 4 }],
        ['9', { filename_prefix: 'x' }],
      ]),
    );

    expect(own(next)).toEqual({ values: { '3': { seed: 42 } } });
  });

  it('書いた値を読み戻せる。subgraph の中の id もそのまま', () => {
    const values = new Map([['3:70', { seed: 7 }]]);
    const saved = workflow({ kisara: { values: { '3:70': { seed: 7 } }, widths: {} } });

    expect(savedAppValues(saved)).toEqual(values);
  });

  it('読めない形の値は落とす', () => {
    const broken = workflow({ kisara: { values: { '3': 'x', '4': {} } } });

    expect(savedAppValues(broken).size).toBe(0);
  });

  it('開くときはワークフローから外し、幅は残す', () => {
    const saved = workflow({ kisara: { values: { '3': { seed: 1 } }, widths: { '3:seed': 6 } } });

    expect(own(withoutSavedAppValues(saved))).toEqual({ widths: { '3:seed': 6 } });
  });

  it('値が無ければ何も足さず、同じものを返す', () => {
    expect(withSavedAppValues(wf, new Map())).toBe(wf);
    expect(withoutSavedAppValues(wf)).toBe(wf);
  });
});

describe('アプリ入力の高さ', () => {
  const wf = workflow({
    linearData: {
      inputs: [
        [3, 'text', { height: 120, width: 200 }],
        [3, 'seed'],
      ],
      outputs: [],
    },
  });

  it('3 番目の要素の height を読む', () => {
    expect([...appInputHeights(wf)]).toEqual([['3:text', 120]]);
  });

  it('書くときは 3 番目の要素のほかのキーを残す', () => {
    const next = setAppInputHeight(wf, 3, 'text', 200);

    expect(linear(next).inputs).toEqual([
      [3, 'text', { height: 200, width: 200 }],
      [3, 'seed'],
    ]);
  });

  it('3 番目の要素が無ければ足す', () => {
    const next = setAppInputHeight(wf, 3, 'seed', 80);

    expect((linear(next).inputs as unknown[][])[1]).toEqual([3, 'seed', { height: 80 }]);
  });

  it('下限より小さければ下限に寄せる', () => {
    expect(appInputHeights(setAppInputHeight(wf, 3, 'text', 1)).get('3:text')).toBe(48);
  });

  it('同じ高さ・アプリ入力でないものは作り直さない', () => {
    expect(setAppInputHeight(wf, 3, 'text', 120)).toBe(wf);
    expect(setAppInputHeight(wf, 3, 'cfg', 120)).toBe(wf);
  });

  it('カードの高さ（size）は変えない', () => {
    const next = setAppInputHeight(wf, 3, 'text', 200);

    expect(next.nodes).toBe(wf.nodes);
  });
});

describe('アプリ入力を足す位置', () => {
  // 通し番号は処理順（線が無ければ位置の順）。1 → 2 → 3
  const ordered = (inputs: unknown[]): Workflow => ({
    nodes: [
      { id: 1, type: 'A', pos: [0, 0] },
      { id: 2, type: 'B', pos: [100, 0] },
      { id: 3, type: 'C', pos: [200, 0] },
    ],
    links: [],
    extra: { linearData: { inputs, outputs: [] } },
  });

  it('後ろの番号のカードの項目より前に入れる', () => {
    const next = toggleAppInput(
      ordered([
        [1, 'a'],
        [3, 'c'],
      ]),
      2,
      'b',
    );

    expect(appInputOrder(next).map((ref) => ref.widgetName)).toEqual(['a', 'b', 'c']);
  });

  it('同じカードの項目の後に続ける。いちばん後ろの番号なら末尾', () => {
    const wf = ordered([
      [1, 'a'],
      [3, 'c'],
    ]);

    expect(appInputOrder(toggleAppInput(wf, 1, 'z')).map((ref) => ref.widgetName)).toEqual([
      'a',
      'z',
      'c',
    ]);
    expect(appInputOrder(toggleAppInput(wf, 3, 'd')).map((ref) => ref.widgetName)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });
});

describe('枠ごと外す', () => {
  it('まとめて外し、幅の指定も消す（他の枠は残す）', () => {
    const wf = workflow({
      linearData: {
        inputs: [
          [3, 'seed'],
          [3, 'steps'],
          [9, 'filename_prefix'],
        ],
        outputs: [],
      },
      kisara: { widths: { '3:seed': 6 } },
    });
    const next = removeAppInputs(wf, [
      { nodeId: 3, widgetName: 'seed' },
      { nodeId: 3, widgetName: 'steps' },
    ]);

    expect(linear(next).inputs).toEqual([[9, 'filename_prefix']]);
    expect(own(next)).toBeUndefined();
  });

  it('外すものが無ければ同じものを返す', () => {
    const wf = workflow({ linearData: { inputs: [], outputs: [] } });

    expect(removeAppInputs(wf, [{ nodeId: 3, widgetName: 'seed' }])).toBe(wf);
  });
});

describe('結線したパラメータ', () => {
  const linked: Workflow = {
    nodes: [
      {
        id: 3,
        type: 'KSampler',
        pos: [0, 0],
        inputs: [{ name: 'seed', type: 'INT', widget: { name: 'seed' }, link: 7 }],
      },
    ],
    links: [],
    extra: {
      linearData: {
        inputs: [
          [3, 'seed'],
          [3, 'steps'],
        ],
        outputs: [],
      },
      kisara: { widths: { '3:seed': 6 } },
    },
  };

  it('アプリ入力から外し、幅の指定も消す（繋がっていないものは残す）', () => {
    const next = dropLinkedAppInputs(linked);

    expect(linear(next).inputs).toEqual([[3, 'steps']]);
    expect(own(next)).toBeUndefined();
  });

  it('外すものが無ければ同じものを返す', () => {
    const plain = workflow({ linearData: { inputs: [[3, 'seed']], outputs: [] } });

    expect(dropLinkedAppInputs(plain)).toBe(plain);
  });
});

describe('実行時のアプリ入力の差し込み', () => {
  const prompt = {
    '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 8 } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI' } },
  };

  it('入っている値だけを上書きする（カード側の値は触らない）', () => {
    const next = applyAppValues(prompt, new Map([['3', { seed: 42 }]]));

    expect(next['3']?.inputs).toEqual({ seed: 42, steps: 8 });
    expect(next['9']).toEqual(prompt['9']);
    // 元の prompt は書き換えない
    expect(prompt['3']?.inputs.seed).toBe(1);
  });

  it('アプリ入力から外したものの値は使わない', () => {
    const wf = workflow({ linearData: { inputs: [[3, 'seed']], outputs: [] } });
    const values = new Map([
      ['3', { seed: 42, steps: 4 }],
      ['9', { filename_prefix: 'x' }],
    ]);

    expect([...appValuesInUse(wf, values)]).toEqual([['3', { seed: 42 }]]);
  });

  it('結線されている入力は上書きしない', () => {
    const withLink = { '3': { class_type: 'KSampler', inputs: { seed: ['12', 0], steps: 8 } } };
    const next = applyAppValues(withLink, new Map([['3', { seed: 42, steps: 4 }]]));

    expect(next['3']?.inputs).toEqual({ seed: ['12', 0], steps: 4 });
  });

  it('prompt に無い入力は無視する（control_after_generate など）', () => {
    const next = applyAppValues(
      prompt,
      new Map([
        ['3', { control_after_generate: 'randomize' }],
        ['99', { seed: 1 }],
      ]),
    );

    expect(next).toEqual(prompt);
  });

  it('subgraph 内のノード（`59:70`）も指せる', () => {
    const flattened = { '59:70': { class_type: 'X', inputs: { text: 'もと' } } };

    const applied = applyAppValues(flattened, new Map([['59:70', { text: 'あと' }]]));

    expect(applied['59:70']?.inputs).toEqual({ text: 'あと' });
  });

  it('値が無ければそのまま返す', () => {
    expect(applyAppValues(prompt, new Map())).toBe(prompt);
  });
});

describe('subgraph の昇格 widget', () => {
  it('値の入り先は内部ノード（`インスタンス:内部ノード`）', () => {
    const row = nodeRow({
      name: 'text',
      type: 'STRING',
      target: {
        kind: 'subgraph',
        subgraphId: 'sg',
        innerNodeId: 70,
        innerClassType: 'CLIPTextEncode',
      },
      widgetName: 'text',
      appInput: true,
      linkable: false,
      multiline: true,
    });

    expect(promptNodeIdFor(59, row)).toBe('59:70');
  });

  it('普通のノードはそのままの id', () => {
    const row = nodeRow({
      name: 'seed',
      target: { kind: 'node', nodeId: 3, classType: 'KSampler' },
      widgetName: 'seed',
      appInput: true,
    });

    expect(promptNodeIdFor(3, row)).toBe('3');
  });
});

// ─────────────────────────────
// 並び順。**`linearData.inputs` の配列順がそのまま並び順**（独自キーは足さない）。
// ─────────────────────────────

describe('アプリ入力の並び順', () => {
  const wf = workflow({
    ds: { scale: 1 },
    linearData: {
      inputs: [
        [3, 'seed', { width: 200 }],
        ['3', 'steps'],
        [9, 'cfg'],
      ],
      outputs: [12],
    },
  });

  it('配列順で読める', () => {
    expect(appInputOrder(wf)).toEqual([
      { nodeId: 3, widgetName: 'seed' },
      { nodeId: 3, widgetName: 'steps' },
      { nodeId: 9, widgetName: 'cfg' },
    ]);
  });

  it('移した先の位置に入り、他の要素は保たれる', () => {
    const moved = moveAppInput(
      wf,
      { nodeId: 9, widgetName: 'cfg' },
      { nodeId: 3, widgetName: 'seed' },
    );

    expect(appInputOrder(moved)).toEqual([
      { nodeId: 9, widgetName: 'cfg' },
      { nodeId: 3, widgetName: 'seed' },
      { nodeId: 3, widgetName: 'steps' },
    ]);
    // 3要素目の設定・outputs・他の extra は落とさない
    const data = (moved.extra as { linearData: { inputs: unknown[][]; outputs: unknown[] } })
      .linearData;
    expect(data.inputs.find((entry) => entry[1] === 'seed')?.[2]).toEqual({ width: 200 });
    expect(data.outputs).toEqual([12]);
    expect((moved.extra as { ds: unknown }).ds).toEqual({ scale: 1 });
  });

  it('別の枠に重ねても中へは入れず、下へ動かせば枠の後ろ、上へ動かせば前に置く', () => {
    // 並び: 9 / 3 3 3 / 5（枠は 9・3・5 の 3 つ）
    const ids = [9, 3, 3, 3, 5];

    // 9 を 3 の枠の真ん中に重ねた → 3 の枠の後ろ（抜いたあとの並びで 3 番目）
    expect(appInputDrop(ids, 0, 2)).toEqual({ index: 3, scope: 'group', side: 'after' });
    // 5 を 3 の枠の真ん中に重ねた → 3 の枠の前
    expect(appInputDrop(ids, 4, 2)).toEqual({ index: 1, scope: 'group', side: 'before' });
    // 同じ枠の中は項目の間へ
    expect(appInputDrop(ids, 1, 3)).toEqual({ index: 3, scope: 'row', side: 'after' });
  });

  it('下へ動かして別の枠に重ねると、その枠を割らずに後ろへ付く', () => {
    const three: Workflow = workflow({
      linearData: {
        inputs: [
          [9, 'cfg'],
          [3, 'seed'],
          [3, 'steps'],
        ],
      },
    });
    const moved = moveAppInput(
      three,
      { nodeId: 9, widgetName: 'cfg' },
      { nodeId: 3, widgetName: 'seed' },
    );

    expect(appInputOrder(moved).map((ref) => ref.widgetName)).toEqual(['seed', 'steps', 'cfg']);
  });

  it('見つからない指定では何もしない', () => {
    expect(
      moveAppInput(wf, { nodeId: 99, widgetName: 'x' }, { nodeId: 3, widgetName: 'seed' }),
    ).toBe(wf);
  });

  it('並べ替え用の id は往復できる', () => {
    const ref = { nodeId: 3, widgetName: 'control_after_generate' };
    expect(parseAppInputDragId(`app:3:control_after_generate`)).toEqual(ref);
    expect(parseAppInputDragId('in:3:0')).toBeNull();
    expect(parseAppInputDragId(12)).toBeNull();
  });
});

// ─────────────────────────────
// 表示グループ。**並び順に従い、同じカードが連続する区間**を1つの枠にする。
// ─────────────────────────────

function row(widgetName: string): NodeRow {
  return nodeRow({ name: widgetName, label: widgetName, widgetName, appInput: true });
}

function view(id: number, index: number, names: string[]): NodeView {
  return nodeView({ id, index: String(index), displayName: `N${id}`, rows: names.map(row) });
}

describe('アプリ入力のグループ', () => {
  const views = [view(1, 1, ['a', 'b']), view(2, 2, ['c'])];

  it('並び順どおりに並べ、同じカードの連続はまとめる', () => {
    const groups = appInputGroups(views, [
      { nodeId: 1, widgetName: 'b' },
      { nodeId: 1, widgetName: 'a' },
      { nodeId: 2, widgetName: 'c' },
    ]);

    expect(groups.map((group) => [group.nodeId, group.rows.map((r) => r.widgetName)])).toEqual([
      [1, ['b', 'a']],
      [2, ['c']],
    ]);
  });

  it('別カードを挟んだら枠が分かれる', () => {
    const groups = appInputGroups(views, [
      { nodeId: 1, widgetName: 'a' },
      { nodeId: 2, widgetName: 'c' },
      { nodeId: 1, widgetName: 'b' },
    ]);

    expect(groups.map((group) => group.key)).toEqual(['1:0', '2:0', '1:1']);
  });

  // 鍵が変わると枠ごと作り直され、キーボードで並べ替えた項目から焦点が消える
  it('枠の中で並べ替えても鍵は変わらない', () => {
    const keyOf = (order: { nodeId: number; widgetName: string }[]): string | undefined =>
      appInputGroups(views, order)[0]?.key;
    const a = { nodeId: 1, widgetName: 'a' };
    const b = { nodeId: 1, widgetName: 'b' };

    expect(keyOf([a, b])).toBe(keyOf([b, a]));
  });

  it('消えたノード・widget は落とす', () => {
    expect(appInputGroups(views, [{ nodeId: 9, widgetName: 'a' }])).toEqual([]);
  });
});
describe('掴んでいる間の枠の並び', () => {
  const views = [view(1, 1, ['a', 'b']), view(2, 2, ['c', 'd'])];
  const ref = (nodeId: number, widgetName: string): { nodeId: number; widgetName: string } => ({
    nodeId,
    widgetName,
  });
  const groups = appInputGroups(views, [ref(1, 'a'), ref(1, 'b'), ref(2, 'c'), ref(2, 'd')]);
  const shape = (shown: readonly { nodeId: number; rows: readonly NodeRow[] }[]): unknown =>
    shown.map((group) => [group.nodeId, group.rows.map((row) => row.widgetName)]);

  it('落としたときと同じ並びで見せる。別の枠の中へは入れない', () => {
    expect(shape(droppedGroups(groups, ref(1, 'a'), ref(1, 'b')))).toEqual([
      [1, ['b', 'a']],
      [2, ['c', 'd']],
    ]);
    // 下へ動かして別の枠に重ねたら、その枠の後ろ（元の枠は分かれずに残りが残る）
    expect(shape(droppedGroups(groups, ref(1, 'a'), ref(2, 'c')))).toEqual([
      [1, ['b']],
      [2, ['c', 'd']],
      [1, ['a']],
    ]);
  });

  it('鍵は並び直した枠で付け直す。相手が無ければそのまま', () => {
    const moved = droppedGroups(groups, ref(1, 'a'), ref(2, 'd'));
    expect(moved.map((group) => group.key)).toEqual(['1:0', '2:0', '1:1']);
    expect(droppedGroups(groups, ref(1, 'a'), ref(9, 'x'))).toBe(groups);
  });
});
