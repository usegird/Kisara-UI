// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ToolsPromptCard } from '@/components/llm/prompt/ToolsPromptCard';
import type { ActiveWorkflowTool } from '@/store/use-workflow-tools-store';

// ─────────────────────────────
// プロンプトのタブの Comfy Workflow の行。開くと 1 件ごとに機能名と数
// ─────────────────────────────

function active(id: string, name: string): ActiveWorkflowTool {
  return {
    target: { id, tabId: `tab-${id}`, path: null, name },
    tool: { name, description: '', params: [], outputs: [] },
    args: [],
    definition: {
      type: 'function',
      function: { name, description: '', parameters: { type: 'object', properties: {} } },
    },
  };
}

afterEach(cleanup);

describe('Comfy Workflow の行', () => {
  it('開くと、送るワークフロー 1 件ごとに機能名とトークン数を 1 行ずつ出す', () => {
    render(
      <ToolsPromptCard
        tools={[active('a', 'make_image'), active('b', 'upscale')]}
        tokens={70}
        toolTokens={
          new Map([
            ['a', 40],
            ['b', 30],
          ])
        }
        open
        onToggle={() => undefined}
      />,
    );
    const lines = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(lines).toEqual(['make_image40', 'upscale30']);
    // 機能名を指すと、送る定義の JSON を出す
    const name = screen.getByText('make_image');
    expect(JSON.parse(name.title)).toMatchObject({ function: { name: 'make_image' } });
  });
});
