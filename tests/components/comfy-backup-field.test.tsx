// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComfyBackupField } from '@/components/llm/side-panel/ComfyBackupField';
import { useSettingsStore } from '@/store/use-settings-store';

beforeEach(() => {
  useSettingsStore.setState({ chatComfyBackup: false });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ chatComfyBackup: false });
});

describe('控えのスイッチ', () => {
  it('入れるときは確かめ、取りやめれば入れない。有効にすると入れる', async () => {
    render(<ComfyBackupField />);
    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByText('ComfyUI に控えを書きますか？')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(useSettingsStore.getState().chatComfyBackup).toBe(false);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(await screen.findByRole('button', { name: '有効にする' }));
    expect(useSettingsStore.getState().chatComfyBackup).toBe(true);
  });

  it('切るときは確かめない', () => {
    useSettingsStore.setState({ chatComfyBackup: true });
    render(<ComfyBackupField />);
    fireEvent.click(screen.getByRole('switch'));
    expect(useSettingsStore.getState().chatComfyBackup).toBe(false);
    expect(screen.queryByText('ComfyUI に控えを書きますか？')).toBeNull();
  });
});
