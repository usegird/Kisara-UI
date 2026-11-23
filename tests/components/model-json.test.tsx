// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchModelJson, hasModelNotesRoute } from '@/comfy/models';
import { fetchJsonEdits, listSavedNotes, saveJsonEdits } from '@/comfy/notes';
import { ModelJson } from '@/components/comfy/flow/dialogs/ModelJson';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

vi.mock('@/comfy/models', () => ({ fetchModelJson: vi.fn(), hasModelNotesRoute: vi.fn() }));
vi.mock('@/comfy/notes', () => ({
  listSavedNotes: vi.fn(),
  fetchJsonEdits: vi.fn(),
  saveJsonEdits: vi.fn(),
}));
const fetchJson = vi.mocked(fetchModelJson);
const probe = vi.mocked(hasModelNotesRoute);
const list = vi.mocked(listSavedNotes);
const edits = vi.mocked(fetchJsonEdits);
const save = vi.mocked(saveJsonEdits);
const base = 'http://127.0.0.1:8188';

beforeEach(() => {
  for (const mock of [fetchJson, probe, list, edits, save]) mock.mockReset();
  probe.mockResolvedValue(true);
  list.mockResolvedValue(new Set());
  save.mockResolvedValue(undefined);
  useModelNotesStore.setState({ status: 'idle', baseUrl: '', error: null });
  useSettingsStore.setState({ baseUrl: base });
});
afterEach(cleanup);

function terms(): string[] {
  return screen.getAllByRole('term').map((term) => term.textContent);
}

function renderJson(insert?: { blocked: null; onInsert: () => void }): void {
  render(<ModelJson folder="loras" filename="a.safetensors" insert={insert} />);
}

describe('同名の JSON の段（出し方）', () => {
  it('見出しは JSON。常に出す 3 つを先頭に、値のあるほかのキーを後ろに出し、値なしは出さない', async () => {
    fetchJson.mockResolvedValue([
      { key: 'sd version', value: 'Unknown' },
      { key: 'extra', value: ' ' },
      { key: 'source', value: 'civitai' },
      { key: 'notes', value: '' },
      { key: 'activation text', value: 'kisara' },
    ]);
    renderJson();

    expect(await screen.findByText('kisara')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'JSON' })).toBeTruthy();
    expect(terms()).toEqual(['activation text', 'negative text', 'preferred weight', 'source']);
  });

  it('kisara/ の差分を元に重ねて出す', async () => {
    list.mockResolvedValue(new Set(['loras/a.safetensors.json']));
    fetchJson.mockResolvedValue([{ key: 'activation text', value: 'old' }]);
    edits.mockResolvedValue(new Map([['activation text', 'new']]));
    renderJson();

    expect(await screen.findByText('new')).toBeTruthy();
    expect(screen.queryByText('old')).toBeNull();
  });

  it('拡張が無くても、常に出す 3 つを出す（元の JSON は読みに行かない）', async () => {
    probe.mockResolvedValue(false);
    renderJson();

    await screen.findByText('negative text');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('長い値は値の中でスクロールする', async () => {
    fetchJson.mockResolvedValue([{ key: 'description', value: 'long text' }]);
    renderJson();

    const value = await screen.findByText('long text');
    expect(value.className).toContain('max-h-20');
    expect(value.className).toContain('overflow-y-auto');
  });

  it('読めないときは段の中に一言を出す', async () => {
    fetchJson.mockRejectedValue(new SyntaxError('broken'));
    renderJson();

    expect(await screen.findByText(/JSON を読めません/)).toBeTruthy();
  });
});

describe('同名の JSON の段（操作）', () => {
  it('activation text は写せて、差し込みを渡されたときは入れられる', async () => {
    fetchJson.mockResolvedValue([{ key: 'activation text', value: ' kisara ' }]);
    const onInsert = vi.fn();
    renderJson({ blocked: null, onInsert });

    fireEvent.click(
      await screen.findByRole('button', { name: 'activation text をキャレットの位置へ入れる' }),
    );
    expect(onInsert).toHaveBeenCalledWith('kisara');
    expect(screen.getByRole('button', { name: 'activation text を写す' })).toBeTruthy();
  });

  it('activation text が値なしなら、写し取りも取り込みも出さない', async () => {
    fetchJson.mockResolvedValue([]);
    renderJson({ blocked: null, onInsert: vi.fn() });

    expect(await screen.findByText('activation text')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'activation text を写す' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'activation text をキャレットの位置へ入れる' }),
    ).toBeNull();
  });

  it('編集を押すと欄になり、書き換えるまでは ×（書かずに戻る）、書き換えたら保存になる', async () => {
    fetchJson.mockResolvedValue([]);
    renderJson();

    fireEvent.click(await screen.findByRole('button', { name: 'negative text を編集' }));
    expect(screen.queryByRole('button', { name: 'negative text を保存' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'negative text の編集をやめる' }));

    expect(screen.getByRole('button', { name: 'negative text を編集' })).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('description・notes は値があっても編集の絵を出さない', async () => {
    fetchJson.mockResolvedValue([
      { key: 'description', value: 'd' },
      { key: 'notes', value: 'n' },
    ]);
    renderJson();

    await screen.findByText('d');
    expect(screen.queryByRole('button', { name: 'description を編集' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'notes を編集' })).toBeNull();
  });

  it('保存でそのキーだけを差分に書いて読むだけへ戻る', async () => {
    fetchJson.mockResolvedValue([{ key: 'activation text', value: 'old' }]);
    renderJson();

    const key = 'negative text';
    fireEvent.click(await screen.findByRole('button', { name: `${key} を編集` }));
    fireEvent.change(screen.getByRole('textbox', { name: key }), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: `${key} を保存` }));

    expect(await screen.findByRole('button', { name: `${key} を編集` })).toBeTruthy();
    expect(screen.getByText('bad')).toBeTruthy();
    const written = save.mock.calls[0]?.[1];
    expect(written?.filename).toBe('a.safetensors');
    expect([...(written?.edits ?? new Map()).entries()]).toEqual([[key, 'bad']]);
  });

  it('推奨の強さは未定義なら値を出さず、欄の初めは 1。0.1 刻みの数の欄で、負の数も書ける', async () => {
    fetchJson.mockResolvedValue([{ key: 'preferred weight', value: '0', structured: true }]);
    renderJson();

    const edit = await screen.findByRole('button', { name: 'preferred weight を編集' });
    expect(
      screen.getByText('preferred weight').closest('div')?.nextElementSibling?.textContent,
    ).toBe('');
    fireEvent.click(edit);
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'preferred weight' });
    expect(field.value).toBe('1');
    expect(field.getAttribute('step')).toBe('0.1');
    expect(field.hasAttribute('min')).toBe(false);
    fireEvent.change(field, { target: { value: '-0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'preferred weight を保存' }));

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1].edits.get('preferred weight')).toBe(-0.3);
  });

  it('文字でない元の値は読むだけ（編集の絵を出さない）', async () => {
    fetchJson.mockResolvedValue([{ key: 'tags', value: '[1]', structured: true }]);
    renderJson();

    await screen.findByText('tags');
    expect(screen.queryByRole('button', { name: 'tags を編集' })).toBeNull();
  });
});
