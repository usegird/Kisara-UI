// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelNotes } from '@/components/comfy/flow/dialogs/ModelNotes';
import type { ModelNotes as ModelNotesValue } from '@/hooks/flow/use-model-notes';

// ─────────────────────────────
// モデルのメモ。読み書きは差し替える（テストから ComfyUI に触れない）。
// ─────────────────────────────

const save = vi.fn<ModelNotesValue['save']>();
let state: ModelNotesValue;
vi.mock('@/hooks/flow/use-model-notes', () => ({ useModelNotes: () => state }));

beforeEach(() => {
  save.mockReset();
  state = { status: 'ready', text: 'old', error: null, save };
});
afterEach(cleanup);

function field(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'メモ' });
}

describe('モデルのメモ', () => {
  it('ファイルの中身を出し、書き換えるまで保存できない', () => {
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    expect(field().value).toBe('old');
    expect(screen.getByRole('button', { name: 'メモを保存' })).toHaveProperty('disabled', true);
  });

  it('ファイルが無ければ空の欄に、保存で作られることを添える', () => {
    state = { ...state, text: null };
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    expect(field().value).toBe('');
    expect(field().placeholder).toContain('保存すると作られます');
  });

  it('保存の成否をその場に出す', async () => {
    save.mockResolvedValueOnce('HTTP 404');
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    fireEvent.change(field(), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'メモを保存' }));

    expect(save).toHaveBeenCalledWith('new');
    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 404');
  });

  it('写し取りは見出しの右に、欄の文面を写す絵だけで置く', () => {
    render(<ModelNotes folder="loras" filename="a.safetensors" />);

    const copy = screen.getByRole('button', { name: 'メモを写す' });
    expect(copy.textContent).toBe('');
    expect(copy.className).not.toContain('border');
  });

  it('差し込みを渡されたときだけ取り込みのアイコンを出し、欄の文面を入れる', () => {
    const onInsert = vi.fn();
    const { rerender } = render(<ModelNotes folder="loras" filename="a.safetensors" />);
    expect(screen.queryByRole('button', { name: 'メモをキャレットの位置へ入れる' })).toBeNull();

    rerender(
      <ModelNotes folder="loras" filename="a.safetensors" insert={{ blocked: null, onInsert }} />,
    );
    fireEvent.change(field(), { target: { value: ' new ' } });
    fireEvent.click(screen.getByRole('button', { name: 'メモをキャレットの位置へ入れる' }));

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

    const button = screen.getByRole('button', { name: 'メモをキャレットの位置へ入れる' });
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
