// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NodeSearchDialog } from '@/components/comfy/flow/dialogs/NodeSearchDialog';
import { ReturnFocus } from '@/components/ui/return-focus';
import { NO_FILTERS } from '@/graph/search';

import { definition, definitionMap, socket } from '../helpers/definitions';
import { stubMissingDom } from '../helpers/dom';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';
import { nodeView } from '../helpers/views';

beforeAll(stubMissingDom);

afterEach(() => {
  cleanup();
});

const DEFINITIONS = definitionMap(
  definition('LoadImage', [], {
    category: 'image',
    outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
  }),
  definition('MyUpscale', [socket('image', 'IMAGE')], {
    module: 'custom_nodes.MyPack',
    category: 'image/upscaling',
    outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
  }),
  definition('MySave', [socket('image', 'IMAGE')], {
    module: 'custom_nodes.MyPack.nodes.save',
    category: 'image',
    outputNode: true,
  }),
);

function show(overrides: Partial<React.ComponentProps<typeof NodeSearchDialog>> = {}) {
  return render(
    <NodeSearchDialog
      open
      definitions={DEFINITIONS}
      title="ここに追加するノード"
      onSelect={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

const names = (): string[] =>
  [...document.querySelectorAll('[cmdk-item]')].map((item) => {
    const [name, category] = [...(item.firstElementChild?.firstElementChild?.children ?? [])];
    return `${name?.textContent ?? ''}${category?.textContent ?? ''}`;
  });

const treeLabels = (): (string | null)[] =>
  [...screen.getByLabelText('分類').querySelectorAll('button')].map((button) => button.textContent);

describe('カードの見本', () => {
  it('候補の行を指すと、少し待ってダイアログの外にカードの見本を出し、離れると消す', async () => {
    show();
    const item = within(screen.getByRole('dialog')).getByText('MyUpscale').closest('[cmdk-item]');
    const name = item?.firstElementChild as HTMLElement;

    fireEvent.pointerEnter(name);
    fireEvent.mouseEnter(name);
    expect(screen.queryByRole('article', { name: 'MyUpscale' })).toBeNull();

    const card = await screen.findByRole('article', { name: 'MyUpscale' });
    expect(screen.getByRole('dialog').contains(card)).toBe(false);
    expect(within(card).getByText('image')).toBeDefined();
    expect(card.closest('[inert]')).not.toBeNull();

    fireEvent.pointerLeave(name);
    fireEvent.mouseLeave(name);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(screen.queryByRole('article', { name: 'MyUpscale' })).toBeNull();
  });
});

describe('分類の木', () => {
  it('よく使うもの → すべて → 本体の分類 → カスタムノードの順に、件数つきで並べる', () => {
    show();

    expect(treeLabels()).toEqual(['すべて3', 'image1', 'カスタムノード2']);
  });

  it('ワークフローにある種類は現在使用中に入る', () => {
    show({ views: [nodeView({ id: 1, classType: 'MySave' })] });
    const tree = screen.getByLabelText('分類');

    expect(treeLabels().slice(0, 2)).toEqual(['現在使用中1', 'すべて3']);
    fireEvent.click(within(tree).getByText('現在使用中'));
    expect(names()).toEqual(['MySaveimage']);
  });

  it('件数は名前の一致と、分類以外の絞り込みを掛けたあとの数。0 件の項目は出さない', () => {
    show({ initialFilters: { ...NO_FILTERS, output: 'IMAGE' } });
    expect(treeLabels()).toEqual(['すべて2', 'image1', 'カスタムノード1']);

    fireEvent.change(screen.getByPlaceholderText('ノード名で検索'), {
      target: { value: 'upscale' },
    });
    expect(treeLabels()).toEqual(['すべて1', 'カスタムノード1']);
  });

  it('選んだ項目だけを開き、その下位のノードに絞る。行には常に分類の最上位を出す', () => {
    show();
    const tree = screen.getByLabelText('分類');

    fireEvent.click(within(tree).getByText('カスタムノード'));
    expect(treeLabels()).toEqual(['すべて3', 'image1', 'カスタムノード2', 'image2']);

    fireEvent.click(within(tree).getAllByText('image')[1] as HTMLElement);
    const firstLines = [...document.querySelectorAll('[cmdk-item]')].map((item) =>
      [...(item.firstElementChild?.firstElementChild?.children ?? [])]
        .slice(0, 2)
        .map((part) => part.textContent),
    );
    expect(firstLines).toEqual([
      ['MySave', 'image'],
      ['MyUpscale', 'image'],
    ]);

    fireEvent.click(within(tree).getByText('すべて'));
    expect(names()).toHaveLength(3);
  });

  it('利用頻度の表があれば、よく使うものを選んだ状態で開き、頻度の順に並べる', () => {
    show({ frequency: ['MyUpscale', 'Unknown', 'LoadImage'] });

    expect(treeLabels()).toEqual(['よく使うもの2', 'すべて3', 'image1', 'カスタムノード2']);
    expect(screen.getByRole('button', { name: /よく使うもの/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(names()).toEqual(['MyUpscaleimage', 'LoadImageimage']);
  });
});

describe('呼び出し元からの絞り込み', () => {
  it('出せるノードだけに絞った状態で開ける', () => {
    show({ initialFilters: { ...NO_FILTERS, output: 'IMAGE' } });

    expect(screen.getByLabelText<HTMLSelectElement>('出力の型で絞り込む').value).toBe('IMAGE');
    expect(names()).toEqual(['LoadImageimage', 'MyUpscaleimage']);
  });

  it('「指定なし」に戻すと全部出る（解除のボタンは持たない）', () => {
    show({ initialFilters: { ...NO_FILTERS, output: 'IMAGE' } });
    fireEvent.change(screen.getByLabelText('出力の型で絞り込む'), { target: { value: '' } });

    expect(screen.queryByText('解除')).toBeNull();
    expect(names()).toHaveLength(3);
  });

  it('分類の絞り込みは持たず、行の分類は最上位だけ', () => {
    show();

    expect(screen.queryByLabelText('カテゴリで絞り込む')).toBeNull();
    expect(names()).toContain('MyUpscaleimage');
  });

  it('名前の入力と絞り込みは併用できる', () => {
    show({ initialFilters: { ...NO_FILTERS, output: 'IMAGE' } });
    fireEvent.change(screen.getByPlaceholderText('ノード名で検索'), {
      target: { value: 'upscale' },
    });

    expect(names()).toEqual(['MyUpscaleimage']);
  });
});

describe('ノード参照', () => {
  const views = [
    nodeView({
      id: 1,
      index: '1',
      displayName: 'Load Image',
      outputs: [{ name: 'IMAGE', type: 'IMAGE', values: [] }],
    }),
    nodeView({
      id: 3,
      index: '3',
      displayName: 'Scale',
      outputs: [{ name: 'IMAGE', type: 'IMAGE', values: [] }],
    }),
  ];

  it('起点が無い（末尾に足す）ときはノード参照を選べない', () => {
    show();

    expect(screen.getByRole('tab', { name: 'ノード参照' })).toHaveProperty('disabled', true);
  });

  it('左にノード（先頭にすべて）、右に出力を出し、選ぶと繋ぐ口を返す', () => {
    const onPickReference = vi.fn();
    show({
      reference: { side: 'outputs', exclude: 3, type: 'IMAGE' },
      views,
      onPickReference,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'ノード参照' }));

    const nav = screen.getByRole('navigation', { name: '参照するノード' });
    const entries = within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(entries).toEqual(['すべて1', '1Load Image1']);

    const list = screen.getByRole('listbox', { name: '接続元の出力' });
    fireEvent.click(within(list).getByRole('option', { name: /Load Image/ }));
    expect(onPickReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 1, slot: 0, name: 'IMAGE' }),
    );
  });
});

describe('候補の行', () => {
  it('1 行目の右寄せに入力の型、2 行目に説明と右寄せに出力の型', () => {
    show({
      definitions: definitionMap(
        definition('Upscale', [socket('image', 'IMAGE'), socket('mask', 'MASK')], {
          outputs: [{ name: 'IMAGE', type: 'IMAGE' }],
          description: '画像を拡大します',
        }),
        definition('Loader', []),
      ),
    });
    const [loader, upscale] = [...document.querySelectorAll('[cmdk-item]')];
    const lines = (item: Element | undefined): (string | null)[][] =>
      [...(item?.firstElementChild?.children ?? [])].map((line) =>
        [...line.children].map((part) => part.textContent),
      );

    expect(lines(upscale)).toEqual([
      ['Upscale', '', 'IMAGE, MASK'],
      ['画像を拡大します', 'IMAGE'],
    ]);
    expect(lines(loader)).toEqual([
      ['Loader', '', '—'],
      ['', '—'],
    ]);
  });
});

describe('漏れ', () => {
  function Placed({ open }: { readonly open: boolean }): React.ReactElement | null {
    return open ? (
      <ReturnFocus>
        <NodeSearchDialog
          open
          definitions={DEFINITIONS}
          title="ここに追加するノード"
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      </ReturnFocus>
    ) : null;
  }

  it('開け閉めを繰り返しても、閉じた検索を残さない', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const leak = leakWatch();
    const { rerender } = render(<Placed open={false} />);

    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        rerender(<Placed open />);
        await Promise.resolve();
      });
      leak.watch(screen.getByRole('dialog'));
      await act(async () => {
        rerender(<Placed open={false} />);
        await Promise.resolve();
      });
    }

    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
    opener.remove();
  });
});
