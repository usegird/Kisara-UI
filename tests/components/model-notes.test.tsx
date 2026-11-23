// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelNotes } from '@/components/comfy/flow/dialogs/ModelNotes';
import type { ModelNotes as ModelNotesValue } from '@/hooks/flow/use-model-notes';

const save = vi.fn<ModelNotesValue['save']>();
let state: ModelNotesValue;
vi.mock('@/hooks/flow/use-model-notes', () => ({ useModelNotes: () => state }));

beforeEach(() => {
  save.mockReset();
  state = { status: 'ready', text: 'old', error: null, save };
});
afterEach(cleanup);

function field(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'txt' });
}

describe('モデルのメモ', () => {
  it('読むだけのときは欄にせず文面を出し、編集を押すと欄に替えて焦点を移す', async () => {
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('old')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'txt を保存' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));

    expect(field().value).toBe('old');
    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(screen.queryByRole('button', { name: 'txt を編集' })).toBeNull();
  });

  it('書き換えるまでは ×（書かずに戻る）で、元の文面に戻すと × に戻る。書けたら読むだけへ戻る', async () => {
    save.mockResolvedValueOnce(null);
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));
    expect(screen.queryByRole('button', { name: 'txt を保存' })).toBeNull();
    fireEvent.change(field(), { target: { value: 'x' } });
    fireEvent.change(field(), { target: { value: 'old' } });
    fireEvent.click(screen.getByRole('button', { name: 'txt の編集をやめる' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));
    fireEvent.change(field(), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'txt を保存' }));

    expect(await screen.findByRole('button', { name: 'txt を編集' })).toBeTruthy();
    expect(save).toHaveBeenCalledWith('new');
    expect(screen.getByText('new')).toBeTruthy();
  });

  it('ファイルが無ければ空のまま出し、一言を添えない（編集の欄も空）', () => {
    state = { ...state, text: null };
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    const region = screen.getByRole('region');
    expect(region.textContent).toBe('txt');
    expect(region.children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));
    expect(field().value).toBe('');
    expect(field().placeholder).toBe('');
  });

  it('保存の失敗をその場に出し、編集を続ける', async () => {
    save.mockResolvedValueOnce('HTTP 404');
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));
    fireEvent.change(field(), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'txt を保存' }));

    expect(save).toHaveBeenCalledWith('new');
    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 404');
    expect(field().readOnly).toBe(false);
  });

  it('写し取りは見出しの右に、欄の文面を写す絵だけで置く', () => {
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    const copy = screen.getByRole('button', { name: 'txt を写す' });
    expect(copy.textContent).toBe('');
    expect(copy.className).not.toContain('border');
  });

  it('文面が空なら写し取りも取り込みも出さない', () => {
    state = { ...state, text: null };
    render(
      <ModelNotes
        folder="loras"
        filename="a.safetensors"
        insert={{ blocked: null, onInsert: vi.fn() }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'txt を写す' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'txt をキャレットの位置へ入れる' })).toBeNull();
    expect(screen.getByRole('button', { name: 'txt を編集' })).toBeTruthy();
  });

  it('差し込みを渡されたときだけ取り込みのアイコンを出し、欄の文面を入れる', () => {
    const onInsert = vi.fn();
    const { rerender } = render(<ModelNotes folder="loras" filename="a.safetensors" />);
    expect(screen.queryByRole('button', { name: 'txt をキャレットの位置へ入れる' })).toBeNull();

    rerender(
      <ModelNotes folder="loras" filename="a.safetensors" insert={{ blocked: null, onInsert }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'txt を編集' }));
    fireEvent.change(field(), { target: { value: ' new ' } });
    fireEvent.click(screen.getByRole('button', { name: 'txt をキャレットの位置へ入れる' }));

    expect(onInsert).toHaveBeenCalledWith('new');
  });

  it('差し込み先が無ければ取り込みのアイコンを押せず、理由を添える', () => {
    render(
      <ModelNotes
        folder="loras"
        filename="a.safetensors"
        insert={{ blocked: '欄がありません', onInsert: vi.fn() }}
      />,
    );

    const button = screen.getByRole('button', { name: 'txt をキャレットの位置へ入れる' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.title).toBe('欄がありません');
  });

  it('読めなかったときは理由を出し、欄を出さない', () => {
    state = { ...state, status: 'error', text: null, error: 'boom' };
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });
});
