// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolCallRecord, ToolCallState } from '@/chat/types';
import { ChatMessageItem } from '@/components/llm/message/ChatMessageItem';
import { ToolCallList, WorkflowRunMenu } from '@/components/llm/message/ToolCallCard';
import { ToolCallImages } from '@/components/llm/message/ToolCallImages';
import { t } from '@/i18n';
import {
  approveToolCall,
  declineToolCall,
  generateToolCall,
  rerunToolCall,
} from '@/store/run/workflow-tool-run';
import { useChatStore } from '@/store/use-chat-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useViewerStore } from '@/store/use-viewer-store';
import { useWorkflowToolsStore } from '@/store/use-workflow-tools-store';

import { chat, toolCallMessage } from '../helpers/llm';

// 実行（`POST /prompt`）は呼ばない。呼ばれたかだけを見る
vi.mock('@/store/run/workflow-tool-run', () => ({
  approveToolCall: vi.fn(() => Promise.resolve()),
  declineToolCall: vi.fn(),
  rerunToolCall: vi.fn(() => Promise.resolve()),
  generateToolCall: vi.fn(() => Promise.resolve(null)),
}));

// ─────────────────────────────
// ワークフローの呼び出しのカード。承諾と却下は押したときだけで、時間では承諾しない
// ─────────────────────────────

function waiting(id: string): ToolCallRecord {
  return { id, name: 'make_image', arguments: '{"prompt":"cat"}', state: { kind: 'waiting' } };
}

const NONE = new Map();

/** 完了して画像を 1 枚出した状態 */
function image(filename: string): ToolCallState {
  return { kind: 'done', images: [{ filename, subfolder: '', type: 'output' }] };
}

/** 表示する実行を決めていない状態の行 */
function renderList(
  calls: readonly ToolCallRecord[],
  props: {
    readonly edits?: ReadonlyMap<string, ReadonlyMap<string, string>>;
    readonly onEdit?: () => void;
    readonly onRerun?: () => void;
  } = {},
): void {
  render(
    <ToolCallList
      chatId="c1"
      messageId="m1"
      calls={calls}
      shown={NONE}
      edits={props.edits ?? NONE}
      onEdit={props.onEdit ?? vi.fn()}
      onRerun={props.onRerun ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(approveToolCall).mockClear();
  vi.mocked(declineToolCall).mockClear();
  vi.mocked(rerunToolCall).mockClear();
  vi.mocked(generateToolCall).mockClear();
  useConnectionStore.setState({ status: 'connected' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useConnectionStore.setState({ status: 'disconnected' });
});

describe('確認', () => {
  it('待っていても時間では承諾しない', async () => {
    renderList([waiting('call_1')]);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(approveToolCall).not.toHaveBeenCalled();
    expect(screen.queryByText(/秒後に承諾/)).toBeNull();
  });

  it('承諾を押すと、その呼び出しを承諾する', () => {
    renderList([waiting('call_1')]);
    fireEvent.click(screen.getByRole('button', { name: '承諾' }));
    expect(approveToolCall).toHaveBeenCalledWith('c1', 'm1', 'call_1');
  });

  it('却下を押すと、承諾せずに断る', () => {
    renderList([waiting('call_1')]);
    fireEvent.click(screen.getByRole('button', { name: '却下' }));
    expect(declineToolCall).toHaveBeenCalledWith('c1', 'm1', 'call_1');
    expect(approveToolCall).not.toHaveBeenCalled();
  });
});

describe('結果の画像', () => {
  it('ComfyUI の接続先が無ければ、落ちずに画像の名前だけを出す', () => {
    useSettingsStore.setState({ baseUrl: '' });
    const done: ToolCallRecord = {
      id: 'c1',
      name: 'make_image',
      arguments: '{}',
      state: {
        kind: 'done',
        images: [{ filename: 'out_00001_.png', subfolder: '', type: 'output' }],
      },
    };
    render(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[done]}
        shown={NONE}
        onShow={vi.fn()}
      />,
    );
    expect(screen.getByText('out_00001_.png（ComfyUI に接続すると表示します）')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('つないでいない間は取りに行かず名前だけ、接続先に無いと答えた画像も名前だけ出す', () => {
    useSettingsStore.setState({ baseUrl: 'http://comfy' });
    useConnectionStore.setState({ status: 'disconnected' });
    const file = { filename: 'out_00002_.png', subfolder: '', type: 'temp' as const };
    const done: ToolCallRecord = {
      id: 'c1',
      name: 'make_image',
      arguments: '{}',
      state: { kind: 'done', images: [file] },
    };
    const props = {
      chatId: 'c1',
      messageId: 'm1',
      calls: [done],
      shown: NONE,
      onShow: vi.fn(),
    };
    render(<ToolCallImages {...props} />);
    expect(screen.getByText('out_00002_.png（ComfyUI に接続すると表示します）')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    cleanup();

    const url = outputViewUrl('http://comfy', file) ?? '';
    useOutputImagesStore.setState({ images: new Map([[url, 'missing']]) });
    useConnectionStore.setState({ status: 'connected' });
    render(<ToolCallImages {...props} />);
    expect(screen.getByText('out_00002_.png（ComfyUI にもうありません）')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    useOutputImagesStore.setState({ images: new Map() });
  });
});

describe('状態の行と引数', () => {
  it('状態・Comfy Workflow・機能名の右に実行し直すを置き、開くと引数を直して onEdit に渡す', () => {
    const onEdit = vi.fn();
    renderList([waiting('call_1')], { onEdit });
    const toggle = screen.getByRole('button', { name: '承諾待ち : Comfy Workflow - make_image' });
    expect(toggle.nextElementSibling?.getAttribute('aria-label')).toBe('実行し直す');
    expect(screen.queryByLabelText('prompt の値')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('prompt の値'), { target: { value: 'dog' } });
    expect(onEdit).toHaveBeenCalledWith('call_1', 'prompt', 'dog');
  });

  it('作らせた呼び出しは、開いた直下に応答の情報、その下に畳んだ思考を出す', () => {
    const generation = {
      reasoning: 'thinking text',
      usage: { prompt: 120, completion: 30 },
      timing: { firstMs: 400, receivingMs: 600 },
    };
    renderList([{ ...waiting('call_1'), generation }]);
    fireEvent.click(screen.getByRole('button', { name: '承諾待ち : Comfy Workflow - make_image' }));
    const stats = screen.getByRole('group', { name: '応答の情報' });
    expect(stats.textContent).toContain('入力 120 / 出力 30');
    expect(stats.textContent).toContain('1 秒');
    const reasoning = screen.getByRole('button', { name: '思考' });
    expect(
      stats.compareDocumentPosition(reasoning) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText('thinking text')).toBeNull();
    fireEvent.click(reasoning);
    expect(screen.getByText('thinking text')).toBeTruthy();
  });

  it('会話の応答が返した呼び出し（記録が無い）は応答の情報も思考も出さない', () => {
    renderList([waiting('call_1')]);
    fireEvent.click(screen.getByRole('button', { name: '承諾待ち : Comfy Workflow - make_image' }));
    expect(screen.queryByRole('group', { name: '応答の情報' })).toBeNull();
    expect(screen.queryByRole('button', { name: '思考' })).toBeNull();
  });
});

describe('実行し直す', () => {
  function done(id: string): ToolCallRecord {
    return { ...waiting(id), state: { kind: 'done', images: [] } };
  }

  it('直した値を重ねて実行し直し、今の表示を留めて知らせる', () => {
    const onRerun = vi.fn();
    const edits = new Map([['call_1', new Map([['prompt', 'dog']])]]);
    renderList([done('call_1')], { edits, onRerun });
    fireEvent.click(screen.getByRole('button', { name: '実行し直す' }));
    expect(rerunToolCall).toHaveBeenCalledWith('c1', 'm1', 'call_1', '{"prompt":"dog"}');
    expect(onRerun).toHaveBeenCalledWith('call_1', { index: 0, count: 1 });
  });

  it('実行中はアイコンを回して押せず、受け取るまで表示中の画像を変えない', () => {
    useSettingsStore.setState({ baseUrl: '' });
    const queued: ToolCallRecord = {
      ...waiting('call_1'),
      state: { kind: 'queued', promptId: 'p' },
      previousRuns: [{ arguments: '{}', state: image('old.png') }],
    };
    renderList([queued]);
    const button = screen.getByRole('button', { name: '実行中' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
    const { rerender } = render(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[queued]}
        shown={NONE}
        onShow={vi.fn()}
      />,
    );
    expect(screen.getByText(/^old\.png/)).toBeTruthy();
    // 受け取ったら新しい実行に切り替える（留めた表示は実行の数が増えたら外れる）
    const done = { ...queued, state: image('new.png') };
    const pin = new Map([['call_1', { index: 0, count: 1 }]]);
    rerender(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[done]}
        shown={pin}
        onShow={vi.fn()}
      />,
    );
    expect(screen.getByText(/^new\.png/)).toBeTruthy();
  });
});

describe('画像を押す', () => {
  it('画像のビューワーを、その会話の画像の並び（新しい実行が先）でその画像から開く', () => {
    useSettingsStore.setState({ baseUrl: 'http://comfy' });
    const call: ToolCallRecord = {
      ...waiting('call_1'),
      state: image('new.png'),
      previousRuns: [{ arguments: '{}', state: image('old.png') }],
    };
    useChatStore.setState({ chats: { c1: chat([toolCallMessage('m1', [call])]) } });
    render(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[call]}
        shown={NONE}
        onShow={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'new.png を開く' }));
    const viewer = useViewerStore.getState();
    expect(viewer.mode).toBe('overlay');
    expect(viewer.tasks?.map((task) => task.outputs[0]?.filename)).toEqual(['new.png', 'old.png']);
    expect(viewer.current).toBe('m1:call_1:1:output:/new.png');
    viewer.close();
  });
});

describe('実行し直した直後', () => {
  it('承諾待ちに戻っても表示中の画像を変えず、新しい実行に画像が無ければ前を出したまま', () => {
    useSettingsStore.setState({ baseUrl: '' });
    const restarted: ToolCallRecord = {
      ...waiting('call_1'),
      previousRuns: [{ arguments: '{}', state: image('old.png') }],
    };
    const pin = new Map([['call_1', { index: 0, count: 1 }]]);
    const { rerender } = render(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[restarted]}
        shown={pin}
        onShow={vi.fn()}
      />,
    );
    expect(screen.getByText(/^old\.png/)).toBeTruthy();
    const failed: ToolCallRecord = { ...restarted, state: { kind: 'failed', message: 'x' } };
    rerender(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[failed]}
        shown={pin}
        onShow={vi.fn()}
      />,
    );
    expect(screen.getByText(/^old\.png/)).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });
});

describe('ワークフローを実行（アイコンの行）', () => {
  beforeEach(() => {
    const definition = {
      type: 'function' as const,
      function: { name: 'make_image', description: '', parameters: {} },
    };
    useSettingsStore.setState({
      chatComfyTools: true,
      chatComfyToolTargets: [{ id: 't1', tabId: 'tab-1', path: null, name: 'make_image' }],
    });
    useWorkflowToolsStore.setState({
      entries: {
        t1: {
          kind: 'ready',
          tool: { name: 'make_image', description: '', params: [], outputs: [] },
          args: [],
          definition,
          workflow: { nodes: [], links: [] },
          tabName: null,
        },
      },
    });
  });

  it('選んだワークフローの呼び出しを LLM に作らせ、始めと終わりを知らせる', async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    render(
      <WorkflowRunMenu
        chatId="c1"
        messageId="m1"
        className=""
        disabled={false}
        onStart={onStart}
        onEnd={onEnd}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ワークフローを実行' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    fireEvent.click(screen.getByRole('menuitem', { name: 'make_image' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(generateToolCall).toHaveBeenCalledWith('c1', 'm1', 'make_image');
    expect(onStart).toHaveBeenCalledWith('make_image');
    expect(onEnd).toHaveBeenCalledWith(null);
  });

  it('呼べるワークフローが無ければ押せない', () => {
    useSettingsStore.setState({ chatComfyTools: false });
    render(
      <WorkflowRunMenu
        chatId="c1"
        messageId="m1"
        className=""
        disabled={false}
        onStart={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: 'ワークフローを実行' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});

describe('実行の切り替え', () => {
  it('実行が 2 回以上あれば切り替えを出し、既定は最後の実行', () => {
    useSettingsStore.setState({ baseUrl: '' });
    const call: ToolCallRecord = {
      ...waiting('call_1'),
      state: image('new.png'),
      previousRuns: [{ arguments: '{}', state: image('old.png') }],
    };
    const onShow = vi.fn();
    render(
      <ToolCallImages
        chatId="c1"
        messageId="m1"
        calls={[call]}
        shown={NONE}
        onShow={onShow}
      />,
    );
    expect(screen.getByText('2/2')).toBeTruthy();
    // 切り替えは画像の下
    const shownImage = screen.getByText(/^new\.png/);
    const step = screen.getByText('2/2');
    const after = shownImage.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(after).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '前の候補' }));
    expect(onShow).toHaveBeenCalledWith('call_1', { index: 0, count: 2 });
  });
});
describe('本文を書かせる', () => {
  function renderMessage(content: string, last: boolean): void {
    const message = toolCallMessage('m1', [waiting('call_1')]);
    const candidates = message.candidates.map((item) => ({ ...item, content }));
    useChatStore.setState({ chats: { c1: chat([{ ...message, candidates }]) } });
    render(
      <ChatMessageItem
        chatId="c1"
        messageId="m1"
        last={last}
        canGenerate
        canRollback
        onRollback={vi.fn()}
        onFork={vi.fn()}
      />,
    );
  }

  it('呼び出しだけの最後の応答に出し、押すとその会話で本文を書かせる', () => {
    const writeReply = vi.spyOn(useChatStore.getState(), 'writeReply').mockImplementation(vi.fn());
    renderMessage('', true);
    fireEvent.click(screen.getByRole('button', { name: t('llm.tool.writeReply') }));
    expect(writeReply).toHaveBeenCalledWith('c1');
    writeReply.mockRestore();
  });

  it('本文がある・最後でない応答には出さない', () => {
    renderMessage('Here.', true);
    expect(screen.queryByRole('button', { name: t('llm.tool.writeReply') })).toBeNull();
    cleanup();
    renderMessage('', false);
    expect(screen.queryByRole('button', { name: t('llm.tool.writeReply') })).toBeNull();
  });
});
