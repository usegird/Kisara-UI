// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SemanticToggle } from '@/components/llm/dictionary/SemanticToggle';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';

import { fakeEmbeddingPort, type FakeEmbeddingPort } from '../helpers/embedding';
import { LEAK_ALLOWANCE, LEAK_ROUNDS, leakWatch } from '../helpers/leak';

let port: FakeEmbeddingPort;

beforeEach(() => {
  port = fakeEmbeddingPort();
  installEmbeddingPort(port);
  useSettingsStore.setState({ loreSemantic: false, dialogLayouts: {}, embeddingModel: '' });
  useSemanticStore.setState({ stored: [] });
});

afterEach(async () => {
  cleanup();
  await useSemanticStore.getState().disable();
});

const toggle = () => screen.getByRole('checkbox', { name: '近似判定' });

const modelRows = () => screen.queryAllByRole('listitem').map((row) => row.textContent);

describe('近似判定のチェック', () => {
  it('モデルが無ければ、モデルと大きさを示して確かめ、やめれば有効にしない', () => {
    render(<SemanticToggle />);
    fireEvent.click(toggle());
    expect(screen.getByText('sirasagi62/ruri-v3-30m-ONNX（37MB）')).toBeTruthy();
    expect(screen.getByText('実行の部品 ONNX Runtime・Transformers.js（14MB）')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(useSettingsStore.getState().loreSemantic).toBe(false);
    expect(useSemanticStore.getState().status).toBe('off');
  });

  it('カードの一番下に埋め込みモデルの欄を置き、決めると設定に書く', () => {
    const { container } = render(<SemanticToggle />);
    const input = screen.getByRole('textbox', { name: '埋め込みモデル' });
    expect(container.firstElementChild?.lastElementChild?.contains(input)).toBe(true);
    fireEvent.change(input, { target: { value: ' org/model ' } });
    fireEvent.blur(input);
    expect(useSettingsStore.getState().embeddingModel).toBe('org/model');
  });

  it('有効にするとモデルを読み、切ると降ろすだけでモデルは残す', async () => {
    render(<SemanticToggle />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: '有効にする' }));
    expect(useSettingsStore.getState().loreSemantic).toBe(true);
    await waitFor(() => expect(modelRows()).toEqual(['ロード済: ruri-v3-30m(44MB)']));

    fireEvent.click(toggle());
    expect(useSettingsStore.getState().loreSemantic).toBe(false);
    await waitFor(() => expect(port.unloaded()).toBe(1));
    expect(port.removed).toEqual([]);
    expect(modelRows()).toEqual(['保存済: ruri-v3-30m(44MB)']);
  });

  it('置いてあるモデルなら確かめずに有効にし、× で消すと無効にする', async () => {
    const id = 'sirasagi62/ruri-v3-30m-ONNX';
    installEmbeddingPort((port = fakeEmbeddingPort(null, [{ id, bytes: 37 * 1024 * 1024 }])));
    render(<SemanticToggle />);
    await waitFor(() => expect(modelRows()).toEqual(['保存済: ruri-v3-30m(37MB)']));

    fireEvent.click(toggle());
    expect(screen.queryByRole('button', { name: '有効にする' })).toBeNull();
    expect(useSettingsStore.getState().loreSemantic).toBe(true);
    await waitFor(() => expect(modelRows()).toEqual(['ロード済: ruri-v3-30m(37MB)']));

    fireEvent.click(screen.getByRole('button', { name: 'ruri-v3-30m を削除' }));
    await waitFor(() => expect(modelRows()).toEqual([]));
    expect(port.removed).toEqual([id]);
    expect(useSettingsStore.getState().loreSemantic).toBe(false);
  });

  it('読めなければ理由とやり直すを出す', async () => {
    installEmbeddingPort(fakeEmbeddingPort({ ok: false, message: 'offline' }));
    useSettingsStore.setState({ loreSemantic: true });
    render(<SemanticToggle />);
    await useSemanticStore.getState().load();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('offline'));
    expect(screen.getByRole('button', { name: 'やり直す' })).toBeTruthy();
  });

  it('確かめの開け閉めを繰り返しても、閉じたダイアログを残さない', async () => {
    const leak = leakWatch();
    render(<SemanticToggle />);
    for (let round = 0; round < LEAK_ROUNDS; round += 1) {
      await act(async () => {
        fireEvent.click(toggle());
        await Promise.resolve();
      });
      leak.watch(await screen.findByRole('button', { name: '有効にする' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
        await Promise.resolve();
      });
    }
    expect(await leak.survivors()).toBeLessThanOrEqual(LEAK_ALLOWANCE);
  });
});
