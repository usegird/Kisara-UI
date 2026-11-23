// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageViewer } from '@/components/comfy/queue/ImageViewer';
import { ViewerSurface } from '@/components/comfy/queue/ViewerSurface';
import { ViewerWindowHost } from '@/components/comfy/queue/ViewerWindowHost';
import type { Popup } from '@/lib/popup';
import type { QueueTask } from '@/queue/queue-tasks';
import { buildSlides } from '@/queue/viewer-slides';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';

import { outputFile, queueTask } from '../helpers/queue';

vi.mock('@/comfy/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/comfy/queue')>()),
  fetchOutputImage: () => Promise.reject(new Error('テストでは取らない')),
}));

afterEach(() => {
  cleanup();
  useSettingsStore.getState().setViewerGrid({ rows: 1, cols: 1 });
});

const TASKS = [
  queueTask('a', [outputFile('a1.png'), outputFile('a2.png')], { number: 2 }),
  queueTask('b', [outputFile('b1.png'), outputFile('b2.png'), outputFile('b3.png')], { number: 1 }),
];

function fakePopup(mount: HTMLElement): Popup {
  const view = {
    addEventListener: globalThis.window.addEventListener.bind(globalThis.window),
    removeEventListener: globalThis.window.removeEventListener.bind(globalThis.window),
    close: () => undefined,
    closed: false,
  };
  return { window: view as unknown as Window, mount };
}

async function show(overrides: Partial<React.ComponentProps<typeof ImageViewer>> = {}) {
  const mount = document.createElement('div');
  document.body.append(mount);
  const onChange = vi.fn();
  const onClose = vi.fn();

  const view = render(
    <ImageViewer
      popup={fakePopup(mount)}
      tasks={TASKS}
      current={buildSlides(TASKS)[0]?.key ?? null}
      baseUrl="http://comfy"
      onChange={onChange}
      onClose={onClose}
      {...overrides}
    />,
  );
  await within(mount).findByLabelText('行を増やす');
  return { mount, onChange, onClose, view };
}

function sideArrow(mount: HTMLElement, label: string): HTMLElement | null {
  const found = within(mount).queryAllByLabelText(label);
  return found.find((element) => element.closest('[data-dialog-header]') === null) ?? null;
}

describe('見た目', () => {
  it('操作の帯は画像に重ね、初めは沈めておく', async () => {
    const { mount } = await show();
    const bar = mount.querySelector('div.absolute.inset-x-0');

    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('inset-x-0');
    expect(bar?.className).toContain('top-0');
    expect(bar?.className).toContain('opacity-0');
    expect(bar?.className).toContain('group-hover/viewer:opacity-100');
  });

  it('別窓の帯は埋め込みと同じ見出しの帯（送り・番号と名前・操作・閉じる）', async () => {
    const { mount } = await show();
    const header = mount.querySelector<HTMLElement>('div.absolute.inset-x-0 [data-dialog-header]');

    expect(header).not.toBeNull();
    expect(within(header!).getByLabelText('新しい方へ')).toBeDefined();
    expect(within(header!).getByRole('heading').textContent).toContain('a2.png');
    expect(within(header!).getByLabelText('閉じる')).toBeDefined();
  });

  it('タブへの重ねでは、操作を見出しの帯に置いて常に出す', () => {
    const view = render(
      <ViewerSurface
        tasks={TASKS}
        current={null}
        baseUrl="http://comfy"
        onChange={() => undefined}
        onClose={() => undefined}
        keyTarget={null}
        bar="header"
      />,
    );

    const header = view.getByLabelText('実サイズで見る').closest('[data-dialog-header]');
    expect(within(header as HTMLElement).getByLabelText('新しい方へ')).toBeDefined();
    expect(within(header as HTMLElement).getByRole('heading')).toBeDefined();
    const older = within(header as HTMLElement).getByLabelText('古い方へ');
    expect(older.nextElementSibling?.textContent).toMatch(/\d+ \/ \d+/u);
    expect(header?.className).not.toContain('absolute');
    expect(header?.className).not.toContain('opacity-0');
    expect(view.container.querySelector('div.absolute.inset-x-0')).toBeNull();
  });

  it('送りの矢印は左右の端の縦の中ほどに置く', async () => {
    const { mount } = await show({ current: buildSlides(TASKS)[1]?.key ?? null });

    const back = sideArrow(mount, '新しい方へ')!;
    const forward = sideArrow(mount, '古い方へ')!;
    expect(back.className).toContain('left-2');
    expect(forward.className).toContain('right-2');
    expect(back.className).toContain('top-1/2');
    expect(back.className).toContain('-translate-y-1/2');
  });

  it('既定は 1 枚。行と列を増やすとその数だけ出す', async () => {
    const { mount } = await show();
    expect(mount.querySelectorAll('img')).toHaveLength(1);

    fireEvent.click(within(mount).getByLabelText('行を増やす'));
    fireEvent.click(within(mount).getByLabelText('列を増やす'));

    expect(mount.querySelectorAll('img')).toHaveLength(4);
    const grid = mount.querySelector('div.grid') as HTMLElement;
    expect(grid.style.gridTemplateRows).toContain('repeat(2');
    expect(grid.style.gridTemplateColumns).toContain('repeat(2');
  });

  it('行と列は数字を出さず、上下の三角で 1 から上限までの間で増減する', async () => {
    const { mount } = await show();
    expect(within(mount).getByLabelText('行を減らす')).toHaveProperty('disabled', true);
    expect(within(mount).getByRole('group', { name: '行 1' })).toBeDefined();
    expect(mount.querySelector('input[type="number"]')).toBeNull();
  });

  it('並べているときに画像を押すと 1 枚を大きく出し、もう一度押すと並びに戻る', async () => {
    const { mount, onChange } = await show();
    fireEvent.click(within(mount).getByLabelText('列を増やす'));
    expect(mount.querySelectorAll('img')).toHaveLength(2);

    fireEvent.click(within(mount).getByRole('button', { name: /a1\.png を大きく見る/u }));
    expect(onChange).toHaveBeenCalledWith(buildSlides(TASKS)[1]?.key);
    expect(mount.querySelectorAll('img')).toHaveLength(1);
    expect(useSettingsStore.getState().viewerGrid).toEqual({ rows: 1, cols: 2 });

    fireEvent.click(within(mount).getByRole('button', { name: '並びに戻す' }));
    expect(mount.querySelectorAll('img')).toHaveLength(2);
  });

  it('1 枚だけ出しているときは、画像を押しても何も起きない', async () => {
    const { mount } = await show();
    expect(within(mount).queryByRole('button', { name: /を大きく見る/u })).toBeNull();
  });

  it('行と列は次に開いたときも同じ', async () => {
    const first = await show();
    fireEvent.click(within(first.mount).getByLabelText('列を増やす'));
    fireEvent.click(within(first.mount).getByLabelText('列を増やす'));
    first.view.unmount();

    const { mount } = await show();
    expect(mount.querySelectorAll('img')).toHaveLength(3);
    expect(useSettingsStore.getState().viewerGrid).toEqual({ rows: 1, cols: 3 });
  });

  it('画像が無ければその旨を出す', async () => {
    const { mount } = await show({ tasks: [queueTask('x', [])], current: null });
    expect(mount.textContent).toContain('表示できる画像がありません');
  });
});

describe('送り', () => {
  it('先頭では新しい方への矢印を出さない', async () => {
    const { mount } = await show();
    expect(sideArrow(mount, '新しい方へ')).toBeNull();
    expect(sideArrow(mount, '古い方へ')).not.toBeNull();
  });

  it('古い方へ送ると次の 1 枚を知らせる（読み込みを待ってから）', async () => {
    const { mount, onChange } = await show();
    fireEvent.click(sideArrow(mount, '古い方へ')!);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(buildSlides(TASKS)[1]?.key));
  });

  it('複数枚のときはページごとに送る', async () => {
    const { mount, onChange } = await show();
    fireEvent.click(within(mount).getByLabelText('列を増やす'));

    fireEvent.click(sideArrow(mount, '古い方へ')!);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(buildSlides(TASKS)[2]?.key));
  });

  it('末尾では古い方への矢印を出さない', async () => {
    const slides = buildSlides(TASKS);
    const { mount } = await show({ current: slides[slides.length - 1]?.key ?? null });
    expect(sideArrow(mount, '古い方へ')).toBeNull();
    expect(sideArrow(mount, '新しい方へ')).not.toBeNull();
  });

  it('通し番号は古いものが 1。先頭は総数になる', async () => {
    const { mount } = await show();
    expect(mount.textContent).toContain('5 / 5');
  });

  it('分母を押すと先頭へ送る', async () => {
    const slides = buildSlides(TASKS);
    const { mount, onChange } = await show({ current: slides[3]?.key ?? null });
    fireEvent.click(within(mount).getByLabelText('先頭へ（全 5 枚）'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(slides[0]?.key));
  });

  it('先頭を出しているときは分母を押せない', async () => {
    const { mount } = await show();
    expect(within(mount).getByLabelText('先頭へ（全 5 枚）')).toHaveProperty('disabled', true);
  });

  it('複数枚のときは範囲で出す', async () => {
    const { mount } = await show();
    fireEvent.click(within(mount).getByLabelText('列を増やす'));

    expect(mount.textContent).toContain('4–5 / 5');
  });
});

describe('送りのモーション', () => {
  const grid = (mount: HTMLElement): string =>
    [...mount.querySelectorAll('div.grid')].at(-1)?.className ?? '';

  const leaving = (mount: HTMLElement): string =>
    [...mount.querySelectorAll('div.grid')].at(0)?.className ?? '';

  it('古い方へ送ると右から入る', async () => {
    const { mount } = await show();
    fireEvent.click(sideArrow(mount, '古い方へ')!);

    await waitFor(() => expect(grid(mount)).toContain('kisara-slide-from-right'));
  });

  it('新しい方へ送ると左から入る', async () => {
    const slides = buildSlides(TASKS);
    const { mount } = await show({ current: slides[slides.length - 1]?.key ?? null });
    fireEvent.click(sideArrow(mount, '新しい方へ')!);

    await waitFor(() => expect(grid(mount)).toContain('kisara-slide-from-left'));
  });

  it('入ってくるのと同時に、古い方は反対側へ送り出す', async () => {
    const { mount } = await show();
    fireEvent.click(sideArrow(mount, '古い方へ')!);

    await waitFor(() => expect(leaving(mount)).toContain('kisara-slide-out-left'));
    expect(mount.querySelectorAll('div.grid')).toHaveLength(2);
  });
});

describe('実サイズ', () => {
  it('切り替えると等倍になり、戻せる', async () => {
    const { mount } = await show();
    expect(mount.querySelector('img')?.className).toContain('object-contain');

    fireEvent.click(within(mount).getByLabelText('実サイズで見る'));
    expect(mount.querySelector('img')?.className).toContain('max-w-none');

    fireEvent.click(within(mount).getByLabelText('画面に合わせる'));
    expect(mount.querySelector('img')?.className).toContain('object-contain');
  });
});

describe('キーボード', () => {
  it('← → で送り、Esc で閉じ、f で実サイズを切り替える', async () => {
    const { mount, onChange, onClose } = await show();

    fireEvent.keyDown(globalThis.window, { key: 'ArrowRight' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(buildSlides(TASKS)[1]?.key));

    fireEvent.keyDown(globalThis.window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    fireEvent.keyDown(globalThis.window, { key: 'f' });
    expect(mount.querySelector('img')?.className).toContain('max-w-none');
  });

  it('Ctrl+F はブラウザの検索に任せ、実サイズを切り替えない', async () => {
    const { mount } = await show();
    const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
    globalThis.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(mount.querySelector('img')?.className).not.toContain('max-w-none');
  });
});

describe('新しい画像の追いかけ', () => {
  function grow(
    view: ReturnType<typeof render>,
    mount: HTMLElement,
    onChange: (key: string) => void,
  ): QueueTask[] {
    const grown = [queueTask('c', [outputFile('c1.png')], { number: 3 }), ...TASKS];

    view.rerender(
      <ImageViewer
        popup={fakePopup(mount)}
        tasks={grown}
        current={buildSlides(TASKS)[0]?.key ?? null}
        baseUrl="http://comfy"
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );
    return grown;
  }

  it('先頭を見ていたら、増えた分の先頭へ送る。読み込むまでは今の画像を出しておく', async () => {
    const { onChange, view, mount } = await show();
    onChange.mockClear();
    const before = mount.querySelector('img')?.getAttribute('alt');

    const grown = grow(view, mount, onChange);
    expect(mount.querySelector('img')?.getAttribute('alt')).toBe(before);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(buildSlides(grown)[0]?.key));
  });

  it('追従では新しい画像が左から入り、今の画像を押しのける', async () => {
    const { onChange, view, mount } = await show();
    const grown = grow(view, mount, onChange);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(buildSlides(grown)[0]?.key));

    view.rerender(
      <ImageViewer
        popup={fakePopup(mount)}
        tasks={grown}
        current={buildSlides(grown)[0]?.key ?? null}
        baseUrl="http://comfy"
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    const incoming = mount.querySelector<HTMLElement>('.kisara-push-in');
    expect(incoming?.style.getPropertyValue('--kx')).toBe('-1');
    const outgoing = mount.querySelector<HTMLElement>('.kisara-push-out');
    expect(outgoing?.style.getPropertyValue('--kx')).toBe('1');
  });

  it('読み込みを待つ間にもう 1 枚出ても、先頭へ送る（並べているとき）', async () => {
    useSettingsStore.getState().setViewerGrid({ rows: 1, cols: 2 });
    const { onChange, view, mount } = await show();
    const draw = (tasks: readonly QueueTask[], current: string | null): void => {
      view.rerender(
        <ImageViewer
          popup={fakePopup(mount)}
          tasks={tasks}
          current={current}
          baseUrl="http://comfy"
          onChange={onChange}
          onClose={vi.fn()}
        />,
      );
    };

    const once = [queueTask('c', [outputFile('c1.png')]), ...TASKS];
    draw(once, buildSlides(TASKS)[0]?.key ?? null);
    const head = buildSlides(once)[0]?.key ?? null;
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(head));
    draw(once, head);

    const twice = [queueTask('d', [outputFile('d1.png')]), ...once];
    draw(twice, head);
    const thrice = [queueTask('e', [outputFile('e1.png')]), ...twice];
    draw(thrice, head);

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(buildSlides(thrice)[0]?.key));
  });

  it('追従を切っていたら、新しい画像が出ても送らない', async () => {
    const { onChange, view, mount } = await show();
    fireEvent.click(within(mount).getByLabelText('新しい画像に追従する'));
    onChange.mockClear();

    grow(view, mount, onChange);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('見る画像を決めずに最新を出しているときに切ったら、今出している画像に留める', async () => {
    const { onChange, mount } = await show({ current: null });
    onChange.mockClear();

    fireEvent.click(within(mount).getByLabelText('新しい画像に追従する'));

    expect(onChange).toHaveBeenCalledWith(buildSlides(TASKS)[0]?.key);
  });
});

describe('別窓の出し先', () => {
  it('画面に 1 つで、別窓のときだけ預けた並びを窓へ描く（右の列のタブに拠らない）', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    render(<ViewerWindowHost />);
    useViewerStore.getState().openOverlay(null, TASKS, 'k1');
    expect(mount.childElementCount).toBe(0);

    act(() => useViewerStore.getState().openWindow(fakePopup(mount)));
    await within(mount).findByLabelText('行を増やす');
    act(() => useViewerStore.getState().close());
    expect(within(mount).queryByLabelText('行を増やす')).toBeNull();
  });
});
