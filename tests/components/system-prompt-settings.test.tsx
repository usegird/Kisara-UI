// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SystemPromptSettings } from '@/components/llm/prompt/SystemPromptCard';
import { memoryTable } from '@/store/persist/chat-repo';
import { useSettingsStore } from '@/store/use-settings-store';
import { installSystemPromptTable, useSystemPromptsStore } from '@/store/use-system-prompts-store';

beforeEach(() => {
  installSystemPromptTable(memoryTable());
  useSystemPromptsStore.setState({ templates: {} });
  useSettingsStore.setState({ llmSystemPrompt: 'Be brief.', llmSystemTemplate: null });
});

afterEach(() => {
  cleanup();
});

describe('別名で保存', () => {
  it('名前を変えずに押すと「〜のコピー」で新しく作って選ぶ。複製のボタンは無い', () => {
    const saved = useSystemPromptsStore.getState().add('Terse', 'Be brief.');
    useSettingsStore.setState({ llmSystemTemplate: { id: saved.id, name: saved.name } });
    render(<SystemPromptSettings />);

    expect(screen.queryByRole('button', { name: '複製を作る' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '別名で保存' }));

    const names = Object.values(useSystemPromptsStore.getState().templates).map((t) => t.name);
    expect(names.sort()).toEqual(['Terse', 'Terse のコピー']);
    expect(useSettingsStore.getState().llmSystemTemplate?.name).toBe('Terse のコピー');
  });
});
