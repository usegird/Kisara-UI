// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogWindow } from '@/components/ui/dialog-window';
import { PanelHeader } from '@/components/ui/panel-header';
import { normalizeDialogLayouts } from '@/lib/dialog-rect';
import { topEmbedded, useDialogStore } from '@/store/use-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ダイアログの出し方。既定は呼び出す側、切り替えたら端末に残す。
// 埋め込みは嵌め先へ出し、一番上の 1 つだけを見せる。
// ─────────────────────────────

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dialogLayouts: {} });
  useDialogStore.setState({ embedHost: null, order: [] });
});

function Panel({
  id,
  mode,
  onClose = () => undefined,
}: {
  id: string;
  mode: 'floating' | 'embedded';
  onClose?: () => void;
}): React.ReactElement {
  return (
    <DialogWindow id={id} label="Window" defaultMode={mode} onClose={onClose}>
      <PanelHeader title={id} onClose={() => undefined} />
    </DialogWindow>
  );
}

function withHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => useDialogStore.getState().setEmbedHost(host));
  return host;
}

describe('読み上げ', () => {
  it('焦点を閉じ込めない枠は、名前の付いた region（dialog にはしない）', () => {
    render(<Panel id="a" mode="floating" />);
    expect(screen.getByRole('region', { name: 'Window' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('出し方', () => {
  it('呼び出す側の既定で嵌め先へ出す。嵌め先が無ければ自由移動', () => {
    const { unmount } = render(<Panel id="a" mode="embedded" />);
    expect(screen.getByRole('button', { name: '埋め込みにする' })).toBeTruthy();
    unmount();

    const host = withHost();
    render(<Panel id="a" mode="embedded" />);
    expect(host.querySelector('[data-dialog-window="a"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '自由移動にする' })).toBeTruthy();
  });

  it('切り替えると入れ替わり、出し方を端末に残す', () => {
    const host = withHost();
    render(<Panel id="a" mode="embedded" />);

    fireEvent.click(screen.getByRole('button', { name: '自由移動にする' }));

    expect(host.querySelector('[data-dialog-window="a"]')).toBeNull();
    expect(useSettingsStore.getState().dialogLayouts.a?.mode).toBe('floating');
    expect(screen.getByRole('button', { name: '埋め込みにする' })).toBeTruthy();
  });

  it('自由移動を持たない枠（ビューワー）は、残した出し方に拠らず埋め込みで、切り替えを出さない', () => {
    const host = withHost();
    useSettingsStore.setState({ dialogLayouts: { v: { mode: 'floating' } } });
    render(
      <DialogWindow
        id="v"
        label="Window"
        defaultMode="embedded"
        floatable={false}
        onClose={() => undefined}
      >
        <PanelHeader title="v" onClose={() => undefined} />
      </DialogWindow>,
    );

    expect(host.querySelector('[data-dialog-window="v"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '自由移動にする' })).toBeNull();
  });

  it('埋め込みは後から開いたものだけを見せる', () => {
    const host = withHost();
    render(
      <>
        <Panel id="a" mode="embedded" />
        <Panel id="b" mode="embedded" />
      </>,
    );
    const shown = (id: string): boolean =>
      !(host.querySelector(`[data-dialog-window="${id}"]`) as HTMLElement).hidden;

    expect([shown('a'), shown('b')]).toEqual([false, true]);
  });
});

describe('開いている順', () => {
  it('上げたものが末尾に来て、一番上の埋め込みを選べる', () => {
    const { raise, remove } = useDialogStore.getState();
    raise('a', 'embedded');
    raise('b', 'floating');
    raise('a', 'embedded');
    expect(useDialogStore.getState().order.map((entry) => entry.id)).toEqual(['b', 'a']);

    remove('a');
    expect(topEmbedded(useDialogStore.getState().order)).toBeNull();
  });
});

describe('自由移動の前後', () => {
  it('後から開いたものが前で、押すと前に出る', () => {
    render(
      <>
        <Panel id="a" mode="floating" />
        <Panel id="b" mode="floating" />
      </>,
    );
    const z = (id: string): number =>
      Number(document.querySelector<HTMLElement>(`[data-dialog-window="${id}"]`)?.style.zIndex);
    expect(z('b')).toBeGreaterThan(z('a'));

    fireEvent.pointerDown(document.querySelector('[data-dialog-window="a"]') as HTMLElement);
    expect(z('a')).toBeGreaterThan(z('b'));
  });
});

describe('埋め込みは 1 つだけ', () => {
  it('埋め込みで開くと、ほかの埋め込みを閉じる。自由移動は閉じない', () => {
    withHost();
    const closeA = vi.fn();
    const closeFloat = vi.fn();
    const { rerender } = render(
      <>
        <Panel id="a" mode="embedded" onClose={closeA} />
        <Panel id="f" mode="floating" onClose={closeFloat} />
      </>,
    );
    expect(closeA).not.toHaveBeenCalled();

    rerender(
      <>
        <Panel id="a" mode="embedded" onClose={closeA} />
        <Panel id="f" mode="floating" onClose={closeFloat} />
        <Panel id="b" mode="embedded" />
      </>,
    );
    expect(closeA).toHaveBeenCalledOnce();
    expect(closeFloat).not.toHaveBeenCalled();
  });

  it('閉じる手続きの無いもの（確かめるダイアログ）は、閉じさせず、ほかも閉じない', () => {
    const closeA = vi.fn();
    const { raise } = useDialogStore.getState();
    act(() => raise('a', 'embedded', closeA));
    act(() => raise('confirm', 'embedded', null));
    expect(closeA).not.toHaveBeenCalled();

    act(() => raise('b', 'embedded', () => undefined));
    expect(closeA).toHaveBeenCalledOnce();
  });

  it('閉じるのをやめたら戻り、その間に開いたものを閉じる', () => {
    const closeB = vi.fn();
    const { raise, reclaim } = useDialogStore.getState();
    act(() => raise('a', 'embedded', () => undefined));
    act(() => raise('b', 'embedded', closeB));

    act(() => reclaim('a'));
    expect(topEmbedded(useDialogStore.getState().order)).toBe('a');
    expect(closeB).toHaveBeenCalledOnce();
  });
});

describe('残した値', () => {
  it('壊れた項目は落とし、読める分だけ残す', () => {
    const layouts = normalizeDialogLayouts({
      a: { mode: 'embedded' },
      b: { mode: 'sideways', rect: { left: 0, top: 0, width: 600, height: 400 } },
      c: 'broken',
      d: {},
    });

    expect(Object.keys(layouts)).toEqual(['a', 'b']);
    expect(layouts.b?.mode).toBeUndefined();
    expect(layouts.b?.rect?.width).toBe(600);
  });
});
