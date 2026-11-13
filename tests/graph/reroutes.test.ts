import { describe, expect, it } from 'vitest';

import { DEFAULT_ORDER_LAYOUT, TITLE_HEIGHT } from '@/graph/node-box';
import { orderedNodeIds, relayout } from '@/graph/order';
import { ownRerouteIds, routeLongLinks, withLinkExtensionsInOrder } from '@/graph/reroutes';
import type { Workflow, WorkflowLink, WorkflowLinkTuple } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 長い線の中継。遠くの複数へ出る線だけを、下の段の中継点で迂回させる。
// ─────────────────────────────

const { gap, stackGap } = DEFAULT_ORDER_LAYOUT;

/** 1→2→…→8 の鎖（列 0〜7）。1 の出力 0 から 3〜8 へも線が出る（5 列以上先は 6・7・8 の 3 本） */
function chain(extraLinks: readonly WorkflowLink[] = []): Workflow {
  const nodes = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
    id,
    type: 'X',
    pos: [(id - 1) * 200, 0] as [number, number],
    size: [100, 50] as [number, number],
  }));
  const links: WorkflowLink[] = [
    [1, 1, 0, 2, 0, 'A'],
    [2, 2, 0, 3, 0, 'A'],
    [3, 3, 0, 4, 0, 'A'],
    [4, 4, 0, 5, 0, 'A'],
    [5, 5, 0, 6, 0, 'A'],
    [6, 6, 0, 7, 0, 'A'],
    [7, 7, 0, 8, 0, 'A'],
    [11, 1, 0, 6, 1, 'A'],
    [12, 1, 0, 7, 1, 'A'],
    [13, 1, 0, 8, 1, 'A'],
    // 3〜5 へも出す（近い線）。各ノードの入力が 2 つになり、支流にならない
    [14, 1, 0, 3, 1, 'A'],
    [15, 1, 0, 4, 1, 'A'],
    [16, 1, 0, 5, 1, 'A'],
    ...extraLinks,
  ];
  return { nodes, links };
}

function reroutesOf(workflow: Workflow): Record<string, unknown>[] {
  const extra = isRecord(workflow.extra) ? workflow.extra : {};
  return Array.isArray(extra.reroutes) ? extra.reroutes.filter(isRecord) : [];
}

function extensionsOf(workflow: Workflow): Record<string, unknown>[] {
  const extra = isRecord(workflow.extra) ? workflow.extra : {};
  return Array.isArray(extra.linkExtensions) ? extra.linkExtensions.filter(isRecord) : [];
}

describe('長い線の中継', () => {
  it('遠い線が 2 本以上あり、合わせて 3 つ以上を貫通する出力に、出力元の直後と接続先の直前の中継点を置く', () => {
    const routed = routeLongLinks(chain(), DEFAULT_ORDER_LAYOUT);
    const reroutes = reroutesOf(routed);
    const head = reroutes[0];
    const tails = reroutes.slice(1);

    expect(reroutes).toHaveLength(4);
    expect(head?.parentId).toBeUndefined();
    expect(head?.linkIds).toEqual([11, 12, 13]);
    expect(tails.map((r) => r.parentId)).toEqual([head?.id, head?.id, head?.id]);
    // 段の高さは、範囲の箱の下端（50）＋縦の隙間。出力元の右端＋隙間の半分、接続先の左端−隙間の半分
    expect(head?.pos).toEqual([100 + gap / 2, 50 + stackGap]);
    expect(tails.map((r) => r.pos)).toEqual([
      [1000 - gap / 2, 50 + stackGap],
      [1200 - gap / 2, 50 + stackGap],
      [1400 - gap / 2, 50 + stackGap],
    ]);
    // 線の親は接続先の直前の中継点。近い線（1→2）には付けない
    expect(extensionsOf(routed).map((e) => [e.id, e.parentId])).toEqual(
      tails.map((r, k) => [[11, 12, 13][k], r.id]),
    );
    expect([...ownRerouteIds(routed)]).toEqual(reroutes.map((r) => r.id));
  });

  it('線の親は links[] の順に並べる（本体が書き直す順。違うと開いただけで変更ありになる）', () => {
    const base = chain();
    const far = (link: WorkflowLink): boolean =>
      [11, 12, 13].includes((link as WorkflowLinkTuple)[0]);
    const reversed: Workflow = {
      ...base,
      links: [...base.links.filter((l) => !far(l)), ...base.links.filter(far).reverse()],
    };
    expect(extensionsOf(routeLongLinks(reversed, DEFAULT_ORDER_LAYOUT)).map((e) => e.id)).toEqual([
      13, 12, 11,
    ]);
  });

  it('保存の前に、崩れた順の線の親を links[] の順へ並べ直す', () => {
    const routed = routeLongLinks(chain(), DEFAULT_ORDER_LAYOUT);
    expect(withLinkExtensionsInOrder(routed)).toBe(routed);
    const shuffled: Workflow = {
      ...routed,
      extra: {
        ...(routed.extra as Record<string, unknown>),
        linkExtensions: [...extensionsOf(routed)].reverse(),
      },
    };
    const ordered = withLinkExtensionsInOrder(shuffled);
    expect(extensionsOf(ordered).map((e) => e.id)).toEqual([11, 12, 13]);
  });

  it('同じ結果なら書き換えない。対象が無ければ中継点も控えも消す', () => {
    const routed = routeLongLinks(chain(), DEFAULT_ORDER_LAYOUT);
    expect(routeLongLinks(routed, DEFAULT_ORDER_LAYOUT)).toBe(routed);

    // 候補の線を 1 本にすると対象から外れる
    const fewer: Workflow = {
      ...routed,
      links: routed.links.filter((l) => l[0] !== 12 && l[0] !== 13),
    };
    const cleared = routeLongLinks(fewer, DEFAULT_ORDER_LAYOUT);
    expect(reroutesOf(cleared)).toHaveLength(0);
    expect(extensionsOf(cleared)).toHaveLength(0);
    expect(ownRerouteIds(cleared).size).toBe(0);
    expect(isRecord(cleared.extra) ? cleared.extra.kisara : undefined).toBeUndefined();
  });

  it('候補の線が 1 本なら何もしない', () => {
    const base = chain();
    const few: Workflow = {
      ...base,
      links: base.links.filter((l) => l[0] !== 12 && l[0] !== 13),
    };
    expect(routeLongLinks(few, DEFAULT_ORDER_LAYOUT)).toBe(few);
  });

  it('箱の幅の半分未満しか横に走らない線（角かすめ）は貫通に数えない', () => {
    // 1 → 8 を斜めにし（8 を y=400 へ）、2〜5 は通り道から外す。10・11 は帯（上下 40px）に
    // 幅の全部が入る。9 は上端の位置で、帯に入る幅が 35%（y=295）か 100%（y=270）になる
    const far = (y9: number): Workflow => {
      const base = chain();
      return {
        ...base,
        nodes: [
          ...base.nodes.map((n) => {
            // 6・7 は上へ逃がし、7 への線が 6 を通らないようにする
            const moved = new Map<number, [number, number]>([
              [6, [1000, -400]],
              [7, [1200, -800]],
              [8, [1400, 400]],
            ]);
            if (n.id >= 2 && n.id <= 5) return { ...n, pos: [n.pos[0], 600] as [number, number] };
            const pos = moved.get(n.id);
            return pos ? { ...n, pos } : n;
          }),
          { id: 9, type: 'X', pos: [700, y9], size: [100, 50] },
          { id: 10, type: 'X', pos: [900, 330], size: [100, 50] },
          { id: 11, type: 'X', pos: [1100, 395], size: [100, 50] },
        ],
      };
    };
    // 貫通は 10・11 の 2 つ。9 は角かすめなので数えず、3 つに届かない
    const grazing = far(295);
    expect(routeLongLinks(grazing, DEFAULT_ORDER_LAYOUT)).toBe(grazing);
    // 9 の幅の全部が帯に入れば 3 つになり、遠い線をまとめて中継する
    // （9〜11 が列を増やすので 5 も 5 列先になり、遠い線は 5・6・7・8 の 4 本）
    expect(reroutesOf(routeLongLinks(far(270), DEFAULT_ORDER_LAYOUT))).toHaveLength(5);
  });

  it('段の床は横の走りがかかる箱だけで決め、最遠の接続先と、走りが半分未満の箱は数えない', () => {
    const base = chain();
    const tall = (id: number, size: [number, number]): Workflow => ({
      ...base,
      nodes: base.nodes.map((n) => (n.id === id ? { ...n, size } : n)),
    });
    const headY = (workflow: Workflow): unknown => {
      const pos: unknown = reroutesOf(routeLongLinks(workflow, DEFAULT_ORDER_LAYOUT))[0]?.pos;
      return Array.isArray(pos) ? (pos[1] as unknown) : undefined;
    };
    // 最遠の接続先（8）が縦に長くても段は下がらない。走りの途中の箱（4）なら下がる
    expect(headY(tall(8, [100, 1000]))).toBe(50 + stackGap);
    expect(headY(tall(4, [100, 400]))).toBe(400 + stackGap);
    // 出力元の列の下に広い箱があっても、走りがその幅の半分未満しかかからなければ数えない
    const wide: Workflow = {
      ...base,
      nodes: [...base.nodes, { id: 9, type: 'X', pos: [0, 200], size: [150, 300] }],
    };
    expect(headY(wide)).toBe(50 + stackGap);
  });

  it('線のつながらないノードは段の床に数えず、中継点が乗るなら右へずらすだけにする', () => {
    const base = chain();
    // 出力元 1 の列の下に、線のつながらない大きな箱 9（x 0〜400、y 30〜630）。走りの幅の半分以上に
    // かかるが、段は下がらない。出力元の中継点はその上に乗るので、右端の外へずらす
    const stacked: Workflow = {
      ...base,
      nodes: [...base.nodes, { id: 9, type: 'X', pos: [0, 30], size: [400, 600] }],
    };
    const [head] = reroutesOf(routeLongLinks(stacked, DEFAULT_ORDER_LAYOUT));
    expect(head?.pos).toEqual([400 + gap / 2, 50 + stackGap]);
  });

  it('中継点が箱に乗るなら、出力元側は右へ、接続先側は左へ、乗らなくなるまでずらす', () => {
    const base = chain();
    // 出力元 1 の列の下に、線のつながらない箱 9（x 0〜150、y 30〜160）。既定の出力元の中継点
    // (100＋隙間の半分, 90) はその上に乗る。接続先 8 の手前にも箱 10（x 1340〜1500）を置く。
    // どちらも走りが幅の半分未満なので床は変わらない
    const crowded: Workflow = {
      ...base,
      nodes: [
        ...base.nodes,
        { id: 9, type: 'X', pos: [0, 60], size: [150, 100] },
        { id: 10, type: 'X', pos: [1340, 60], size: [160, 100] },
      ],
    };
    const reroutes = reroutesOf(routeLongLinks(crowded, DEFAULT_ORDER_LAYOUT));
    expect(reroutes[0]?.pos).toEqual([150 + gap / 2, 50 + stackGap]);
    expect(reroutes.at(-1)?.pos).toEqual([1340 - gap / 2, 50 + stackGap]);
  });

  it('遠くても、間のノードを貫通しない線は中継しない', () => {
    // 6・7・8 をずっと下に置く。1 からの直線は間のノード（y=0 の段）を通らない
    const base = chain();
    const apart: Workflow = {
      ...base,
      nodes: base.nodes.map((n) => (n.id >= 6 ? { ...n, pos: [n.pos[0], 1000] } : n)),
    };
    expect(routeLongLinks(apart, DEFAULT_ORDER_LAYOUT)).toBe(apart);
  });

  it('利用者の中継点と、その線の親は残し、id はその続きから振る', () => {
    const base = chain();
    const theirs: Workflow = {
      ...base,
      extra: {
        reroutes: [{ id: 7, pos: [5, 5], linkIds: [2] }],
        linkExtensions: [{ id: 2, parentId: 7 }],
        keep: true,
      },
    };
    const routed = routeLongLinks(theirs, DEFAULT_ORDER_LAYOUT);
    const reroutes = reroutesOf(routed);

    expect(reroutes[0]).toEqual({ id: 7, pos: [5, 5], linkIds: [2] });
    expect(reroutes.slice(1).map((r) => r.id)).toEqual([8, 9, 10, 11]);
    expect(extensionsOf(routed)[0]).toEqual({ id: 2, parentId: 7 });
    expect([...ownRerouteIds(routed)]).toEqual([8, 9, 10, 11]);
    expect(isRecord(routed.extra) ? routed.extra.keep : undefined).toBe(true);
    // 置き直しても利用者の物は残る
    const again = routeLongLinks({ ...routed, links: routed.links }, DEFAULT_ORDER_LAYOUT);
    expect(reroutesOf(again)[0]).toEqual({ id: 7, pos: [5, 5], linkIds: [2] });
  });

  /** 鎖を 2 段（id +10、y +300、線の id +20）。束が 2 つになる */
  function twoChains(): Workflow {
    const base = chain();
    const shift = (link: WorkflowLink): WorkflowLink => {
      const [id, from, fromSlot, to, toSlot, type] = link as WorkflowLinkTuple;
      return [id + 20, from + 10, fromSlot, to + 10, toSlot, type];
    };
    const lower = base.nodes.map((n) => ({
      ...n,
      id: n.id + 10,
      pos: [n.pos[0], 300] as [number, number],
    }));
    return { nodes: [...base.nodes, ...lower], links: [...base.links, ...base.links.map(shift)] };
  }

  /** 接続先 18 を 1 列右へ動かしたもの（位置の変わったノードは 18 だけ） */
  function with18Moved(workflow: Workflow): Workflow {
    return {
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.id === 18 ? { ...n, pos: [1600, 300] } : n)),
    };
  }

  it('位置の変わったノードの束だけ置き直し、ほかの束の中継点は id も位置も変えない', () => {
    const full = routeLongLinks(twoChains(), DEFAULT_ORDER_LAYOUT);
    const before = reroutesOf(full);
    expect(before).toHaveLength(8);

    const partial = routeLongLinks(with18Moved(full), DEFAULT_ORDER_LAYOUT, new Set([18]));
    const after = reroutesOf(partial);
    // 1 の束（id 1〜4）はそのまま。11 の束は消して、続きの id で置き直す
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4));
    expect(after.slice(4).map((r) => r.id)).toEqual([5, 6, 7, 8]);
    const pos: unknown = before[4]?.pos;
    const y = Array.isArray(pos) ? (pos[1] as unknown) : undefined;
    expect(after[7]?.pos).toEqual([1600 - gap / 2, y]);
    expect([...ownRerouteIds(partial)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 動いたノードが無ければ何も書き換えない
    expect(routeLongLinks(partial, DEFAULT_ORDER_LAYOUT, new Set())).toBe(partial);
  });

  it('位置の変わらない束に利用者が挿した中継点と、その線の親は残る。置き直す束なら消える', () => {
    const full = routeLongLinks(twoChains(), DEFAULT_ORDER_LAYOUT);
    const head = reroutesOf(full)[0];
    const extra = isRecord(full.extra) ? full.extra : {};
    const inserted = { id: 99, parentId: head?.id, pos: [1, 1], linkIds: [11] };
    const theirs: Workflow = {
      ...full,
      extra: {
        ...extra,
        reroutes: [...reroutesOf(full), inserted],
        linkExtensions: extensionsOf(full).map((e) => (e.id === 11 ? { id: 11, parentId: 99 } : e)),
      },
    };

    const kept = routeLongLinks(with18Moved(theirs), DEFAULT_ORDER_LAYOUT, new Set([18]));
    expect(reroutesOf(kept).find((r) => r.id === 99)).toEqual(inserted);
    expect(extensionsOf(kept).find((e) => e.id === 11)?.parentId).toBe(99);

    const redone = routeLongLinks(theirs, DEFAULT_ORDER_LAYOUT, new Set([1]));
    expect(reroutesOf(redone).find((r) => r.id === 99)).toBeUndefined();
    const parent = extensionsOf(redone).find((e) => e.id === 11)?.parentId;
    expect(typeof parent === 'number' && ownRerouteIds(redone).has(parent)).toBe(true);
  });

  it('遠い線の顔ぶれが変わった束は、ノードが動いていなくても置き直す', () => {
    const full = routeLongLinks(twoChains(), DEFAULT_ORDER_LAYOUT);
    const fewer: Workflow = { ...full, links: full.links.filter((l) => l[0] !== 13) };
    const redone = routeLongLinks(fewer, DEFAULT_ORDER_LAYOUT, new Set());
    const reroutes = reroutesOf(redone);
    // 11 の束（id 5〜8）は残り、1 の束は 2 本で置き直す
    expect(reroutes.slice(0, 4).map((r) => r.id)).toEqual([5, 6, 7, 8]);
    expect(reroutes.slice(4).map((r) => r.linkIds)).toEqual([[11, 12], [11], [12]]);
  });

  it('並べ直すと位置の後に中継点を求め、もう一度並べ直しても変わらない', () => {
    const laid = relayout(chain(), [1, 2, 3, 4, 5, 6, 7, 8]);
    const reroutes = reroutesOf(laid);
    const bottom = Math.max(...laid.nodes.map((n) => n.pos[1] + 50));

    expect(reroutes).toHaveLength(4);
    for (const reroute of reroutes) {
      const pos = Array.isArray(reroute.pos) ? reroute.pos : [];
      expect(pos[1]).toBeGreaterThan(bottom - TITLE_HEIGHT);
    }
    expect(orderedNodeIds(laid)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(relayout(laid, orderedNodeIds(laid))).toBe(laid);

    // 古い位置の中継点が残っていても、位置が変わらなければそのまま。原点から置き直すなら直る
    const extra = isRecord(laid.extra) ? laid.extra : {};
    const stale: Workflow = {
      ...laid,
      extra: {
        ...extra,
        reroutes: reroutes.map((r) => ({ ...r, pos: [Array.isArray(r.pos) ? r.pos[0] : 0, 999] })),
      },
    };
    expect(relayout(stale, orderedNodeIds(stale))).toBe(stale);
    const layout = DEFAULT_ORDER_LAYOUT;
    const fromOrigin = { fromOrigin: true };
    const redone = relayout(stale, orderedNodeIds(stale), layout, { ...fromOrigin });
    const fresh = relayout(laid, orderedNodeIds(laid), layout, { ...fromOrigin });
    expect(reroutesOf(redone).map((r) => r.pos)).toEqual(reroutesOf(fresh).map((r) => r.pos));
    expect(reroutesOf(redone).some((r) => Array.isArray(r.pos) && r.pos[1] === 999)).toBe(false);
  });
});
