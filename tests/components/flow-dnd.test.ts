import type { ClientRect, CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';

import { collisionDetection, homesOf, pointerInView } from '@/components/comfy/flow/flow-dnd';
import { scopedId } from '@/graph/subgraph-level';

// ─────────────────────────────
// 当たり判定の振り分け。カードの並べ替えは**カードどうしだけ**で決める。
// ─────────────────────────────

function box(top: number, height: number): ClientRect {
  return { top, left: 0, right: 100, bottom: top + height, width: 100, height };
}

/** 並べ替えの受け口に入っているもの（dnd-kit の sortable が data に載せる形） */
function sortableData(containerId: string): { sortable: { containerId: string } } {
  return { sortable: { containerId } };
}

function container(id: string | number, sortable?: string): DroppableContainer {
  // 判定に使うのは id と data だけ。残りは dnd-kit の内部で使う
  const current = sortable === undefined ? undefined : sortableData(sortable);
  return { id, key: String(id), data: { current }, disabled: false } as never;
}

type Args = Parameters<CollisionDetection>[0];

describe('当たり判定', () => {
  it('カードの並べ替えでは、中のパラメータ行が近くてもカードを選ぶ', () => {
    const rects = new Map<string | number, ClientRect>([
      [2, box(200, 300)],
      // カード 2 の中のパラメータ行。掴んだカードの中心にいちばん近い
      ['in:2:0', box(100, 20)],
    ]);
    const args = {
      active: { id: 1, data: { current: sortableData('cards') } },
      collisionRect: box(90, 40),
      droppableRects: rects,
      droppableContainers: [container(2, 'cards'), container('in:2:0')],
      pointerCoordinates: { x: 50, y: 110 },
    } as unknown as Args;

    expect(collisionDetection(args).map((collision) => collision.id)).toEqual([2]);
  });

  it('枠の外を指しているあいだは、枠の中のカードを外のカードの候補にしない', () => {
    const rects = new Map<string | number, ClientRect>([
      ['group:1', box(200, 400)],
      // 枠の中のカード。掴んだカードにいちばん近い
      [5, box(100, 40)],
    ]);
    const args = {
      active: { id: 1, data: { current: sortableData('cards') } },
      collisionRect: box(90, 40),
      droppableRects: rects,
      droppableContainers: [container('group:1', 'cards'), container(5, 'members:1')],
      pointerCoordinates: { x: 50, y: 110 },
    } as unknown as Args;

    expect(collisionDetection(args).map((collision) => collision.id)).toEqual(['group:1']);
  });

  it('開いた subgraph の中のカードは、外のカードを候補にしない（同じ階層の中だけ）', () => {
    const innerA = scopedId(68, 26);
    const innerB = scopedId(68, 44);
    const rects = new Map<string | number, ClientRect>([
      // 外のカードとグループの枠。指している所にある
      [9, box(100, 40)],
      ['group:1', box(600, 100)],
      [innerB, box(300, 40)],
    ]);
    const args = {
      active: { id: innerA, data: { current: sortableData('subgraph:68') } },
      collisionRect: box(90, 40),
      droppableRects: rects,
      droppableContainers: [
        container(9, 'cards'),
        container('group:1', 'cards'),
        container(innerB, 'subgraph:68'),
      ],
      pointerCoordinates: { x: 50, y: 110 },
    } as unknown as Args;

    expect(collisionDetection(args).map((collision) => collision.id)).toEqual([innerB]);
  });

  it('指している所で決める。自分の上なら自分（置き直して並びが動いても揺れない）', () => {
    const rects = new Map<string | number, ClientRect>([
      [4, box(0, 100)],
      [5, box(110, 400)],
    ]);
    const at = (y: number): unknown[] =>
      collisionDetection({
        active: { id: 4, data: { current: sortableData('cards') } },
        collisionRect: box(y - 20, 40),
        droppableRects: rects,
        droppableContainers: [4, 5].map((id) => container(id, 'cards')),
        pointerCoordinates: { x: 50, y },
      } as unknown as Args).map((collision) => collision.id);

    expect(at(50)).toEqual([4]);
    expect(at(120)).toEqual([5]);
    // 隙間では縦に一番近いもの
    expect(at(104)).toEqual([4]);
  });

  it('キーボードでは掴んだものの中央で決める', () => {
    const rects = new Map<string | number, ClientRect>([
      ['group:1', box(0, 400)],
      [7, box(410, 100)],
    ]);
    const args = {
      active: { id: 'group:1', data: { current: sortableData('cards') } },
      collisionRect: box(300, 400),
      droppableRects: rects,
      droppableContainers: ['group:1', 7].map((id) => container(id, 'cards')),
      pointerCoordinates: null,
    } as unknown as Args;

    expect(collisionDetection(args).map((collision) => collision.id)).toEqual([7]);
  });
  describe('枠の出入り', () => {
    // 枠は 200〜600（上 22px はタブの帯）。中にカード 5（230〜330）と 6（340〜440）
    const rects = new Map<string | number, ClientRect>([
      [1, box(0, 100)],
      ['group:1', box(200, 400)],
      [5, box(230, 100)],
      [6, box(340, 100)],
      [9, box(620, 100)],
    ]);
    const containers = [
      container(1, 'cards'),
      container('group:1', 'cards'),
      container(5, 'members:1'),
      container(6, 'members:1'),
      container(9, 'cards'),
    ];
    const drag = (id: number, from: string, y: number): Args =>
      ({
        active: { id, data: { current: sortableData(from) } },
        collisionRect: box(y - 20, 40),
        droppableRects: rects,
        droppableContainers: containers,
        pointerCoordinates: { x: 50, y },
      }) as unknown as Args;
    const ids = (args: Args): unknown[] => collisionDetection(args).map((c) => c.id);

    it('外のカードで枠の中を指すと、指しているメンバーを選ぶ（グループに入る）', () => {
      expect(ids(drag(1, 'cards', 380))).toEqual([6]);
      // メンバーの間の隙間なら、縦に一番近いメンバー
      expect(ids(drag(1, 'cards', 335))).toEqual([5]);
    });

    it('タブの帯は枠の外とみなす（グループの前後へ入る）', () => {
      expect(ids(drag(1, 'cards', 210))).not.toContain(5);
    });

    it('メンバーで枠の外を指すと、外のカードかグループを選ぶ（グループから抜ける）', () => {
      expect(ids(drag(5, 'members:1', 660))).toEqual([9]);
      expect(ids(drag(5, 'members:1', 610))).toEqual([9]);
    });

    it('メンバーで同じ枠の中を指すあいだは、その中のカードを選ぶ', () => {
      expect(ids(drag(5, 'members:1', 250))).toEqual([5]);
      expect(ids(drag(5, 'members:1', 400))).toEqual([6]);
    });

    it('列の横の外を指すあいだは、置き直して受け口が変わっても同じものを選ぶ', () => {
      // メンバー 5 を掴み、列の右の外（x = 300）で枠の高さを指す。置き直すと 5 は外の受け口に
      // 描かれる。今の受け口で選ぶと、外に置けば自分、中に戻せば枠を選んで行き来が止まらない
      const homes = homesOf(containers);
      const outside = (live: readonly DroppableContainer[]): unknown[] =>
        collisionDetection(
          {
            active: { id: 5, data: { current: sortableData('members:1') } },
            collisionRect: box(260, 40),
            droppableRects: rects,
            droppableContainers: live,
            pointerCoordinates: { x: 300, y: 280 },
          } as unknown as Args,
          homes,
        ).map((c) => c.id);
      const moved = containers.map((entry) => (entry.id === 5 ? container(5, 'cards') : entry));

      expect(outside(moved)).toEqual(outside(containers));
    });

    it('グループを掴んだときは枠の中へ入らず、カードの列のものを選ぶ', () => {
      const group = {
        active: { id: 'group:1', data: { current: sortableData('cards') } },
        collisionRect: box(640, 40),
        droppableRects: rects,
        droppableContainers: containers,
        pointerCoordinates: { x: 50, y: 660 },
      } as unknown as Args;
      expect(ids(group)).toEqual([9]);
    });
  });
});

describe('並べ替えの指の位置', () => {
  it('列の上のヘッダを指していたら、列の見えている上端を指しているとみなす', () => {
    const view = { top: 80, bottom: 700 };

    // 列の上（ヘッダ）・下の外は端へ寄せる。列の中はそのまま
    expect(pointerInView({ x: 10, y: 20 }, view)).toEqual({ x: 10, y: 80 });
    expect(pointerInView({ x: 10, y: 900 }, view)).toEqual({ x: 10, y: 700 });
    expect(pointerInView({ x: 10, y: 300 }, view)).toEqual({ x: 10, y: 300 });
  });

  it('列の上端を指していれば、ヘッダの裏に隠れたカードではなく見えている先頭のカードを選ぶ', () => {
    // 1 は送って列の上（ヘッダの裏）に隠れている。2 が見えている先頭
    const rects = new Map<string | number, ClientRect>([
      [1, box(-200, 260)],
      [2, box(80, 200)],
      [9, box(400, 40)],
    ]);
    const containers = [container(1, 'cards'), container(2, 'cards'), container(9, 'cards')];
    const args = (y: number): Args =>
      ({
        active: containers[2],
        collisionRect: box(y, 40),
        droppableRects: rects,
        droppableContainers: containers,
        pointerCoordinates: pointerInView({ x: 50, y }, { top: 80, bottom: 700 }),
      }) as never;

    expect(collisionDetection(args(20))[0]?.id).toBe(2);
  });
});

// ─────────────────────────────
// 入れ子の枠。重なる枠は内側を選び、掴んだグループは自分の中に入らない。
// ─────────────────────────────

describe('入れ子の枠の当たり判定', () => {
  // 外の列: カード 1・外側の枠 outer（中に inner の枠とカード 4）。inner の中にカード 2
  const rects = new Map<string | number, ClientRect>([
    [1, box(0, 80)],
    ['group:outer', box(100, 400)],
    ['group:inner', box(140, 200)],
    [2, box(180, 120)],
    [4, box(360, 120)],
  ]);
  const containers = [
    container(1, 'cards'),
    container('group:outer', 'cards'),
    container('group:inner', 'members:outer'),
    container(4, 'members:outer'),
    container(2, 'members:inner'),
  ];
  const args = (id: string | number, home: string, y: number): Args =>
    ({
      active: { id, data: { current: sortableData(home) } },
      collisionRect: box(y - 20, 40),
      droppableRects: rects,
      droppableContainers: containers,
      pointerCoordinates: { x: 50, y },
    }) as unknown as Args;
  const hit = (a: Args): unknown => collisionDetection(a)[0]?.id;

  it('カードは重なる枠のうち内側の枠のカードに当たる', () => {
    expect(hit(args(1, 'cards', 250))).toBe(2);
  });

  it('グループも別の枠の中へ入れる（枠のカードに当たる）', () => {
    const outside: Args = {
      ...args('group:x', 'cards', 400),
      droppableContainers: [...containers, container('group:x', 'cards')],
    };
    expect(hit(outside)).toBe(4);
  });

  it('掴んだグループは自分の枠とその中の枠には入らない', () => {
    // outer を掴んで inner の中を指しても、外の列のもの（outer 自身）に当たる
    expect(hit(args('group:outer', 'cards', 250))).toBe('group:outer');
  });
});
