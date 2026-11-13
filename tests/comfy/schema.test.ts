import { describe, expect, it } from 'vitest';

import {
  parseHistory,
  parseHistoryDetail,
  parseOutputFiles,
  parsePromptErrors,
  parsePromptResponse,
} from '@/comfy/schema';
import { parseComfyEvent } from '@/comfy/schema-event';

function event(payload: unknown): ReturnType<typeof parseComfyEvent> {
  return parseComfyEvent(JSON.stringify(payload));
}

describe('WebSocket メッセージの解釈', () => {
  it('status からキュー残数を読む', () => {
    expect(
      event({ type: 'status', data: { status: { exec_info: { queue_remaining: 3 } } } }),
    ).toEqual({ type: 'status', queueRemaining: 3 });
  });

  it('progress を数値つきで読む', () => {
    expect(
      event({ type: 'progress', data: { value: 5, max: 20, prompt_id: 'p1', node: '12' } }),
    ).toEqual({ type: 'progress', promptId: 'p1', node: '12', value: 5, max: 20 });
  });

  it('executing の node が null なら完了を表す', () => {
    expect(event({ type: 'executing', data: { node: null, prompt_id: 'p1' } })).toEqual({
      type: 'executing',
      promptId: 'p1',
      node: null,
      displayNode: null,
    });
  });

  it('execution_error はメッセージを取り出す', () => {
    expect(
      event({
        type: 'execution_error',
        data: { prompt_id: 'p1', node_id: '9', exception_message: 'OOM' },
      }),
    ).toEqual({ type: 'execution_error', promptId: 'p1', node: '9', message: 'OOM' });
  });

  it('execution_error に文面も種類も無ければ null にする（既定の文は画面の側が足す）', () => {
    const parsed = event({ type: 'execution_error', data: { prompt_id: 'p1', node_id: '9' } });
    expect(parsed).toMatchObject({ type: 'execution_error', message: null });
  });

  it('execution_cached はノード id の配列だけ取る', () => {
    expect(
      event({ type: 'execution_cached', data: { prompt_id: 'p1', nodes: ['1', 2, '3'] } }),
    ).toEqual({ type: 'execution_cached', promptId: 'p1', nodes: ['1', '3'] });
  });

  it('未知の種別は捨てずに unknown として通す', () => {
    expect(event({ type: 'feature_flags', data: {} })).toEqual({
      type: 'unknown',
      rawType: 'feature_flags',
    });
  });

  it('必須フィールドが欠けた progress は unknown に落とす', () => {
    expect(event({ type: 'progress', data: { value: 5 } })).toEqual({
      type: 'unknown',
      rawType: 'progress',
    });
  });

  it('バイナリフレームや壊れた JSON は無視する', () => {
    expect(parseComfyEvent(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parseComfyEvent('{ not json')).toBeNull();
    expect(parseComfyEvent(JSON.stringify({ data: {} }))).toBeNull();
  });
});

describe('POST /prompt の応答', () => {
  it('prompt_id を取り出す', () => {
    expect(parsePromptResponse({ prompt_id: 'p1', number: 2 })).toEqual({
      promptId: 'p1',
      number: 2,
    });
  });

  it('prompt_id が無ければ受理されていないとみなす', () => {
    expect(parsePromptResponse({ node_errors: { '1': {} } })).toBeNull();
    expect(parsePromptResponse(null)).toBeNull();
  });
});

describe('DESIGN §9.3-I で確認したメッセージ種別', () => {
  it('progress_state を集約形式のまま読む', () => {
    const parsed = parseComfyEvent(
      JSON.stringify({
        type: 'progress_state',
        data: {
          prompt_id: 'p1',
          nodes: {
            '68:13': {
              value: 7,
              max: 20,
              state: 'running',
              node_id: '68:13',
              display_node_id: '68:13',
            },
            '68:8': { value: 1, max: 1, state: 'finished', node_id: '68:8' },
          },
        },
      }),
    );

    expect(parsed).toEqual({
      type: 'progress_state',
      promptId: 'p1',
      nodes: [
        { nodeId: '68:13', displayNodeId: '68:13', value: 7, max: 20, state: 'running' },
        { nodeId: '68:8', displayNodeId: '68:8', value: 1, max: 1, state: 'finished' },
      ],
    });
  });

  it('execution_success と execution_interrupted を読む', () => {
    expect(
      parseComfyEvent(JSON.stringify({ type: 'execution_success', data: { prompt_id: 'p1' } })),
    ).toEqual({ type: 'execution_success', promptId: 'p1' });

    expect(
      parseComfyEvent(
        JSON.stringify({ type: 'execution_interrupted', data: { prompt_id: 'p1', node_id: '9' } }),
      ),
    ).toEqual({ type: 'execution_interrupted', promptId: 'p1', node: '9' });
  });

  it('executing は display_node も拾う', () => {
    expect(
      parseComfyEvent(
        JSON.stringify({ type: 'executing', data: { node: '3', display_node: '68:3' } }),
      ),
    ).toEqual({ type: 'executing', promptId: null, node: '3', displayNode: '68:3' });
  });
});

describe('POST /prompt の検証エラー', () => {
  it('node_errors をノードごとに読み解く', () => {
    const errors = parsePromptErrors({
      error: { type: 'prompt_outputs_failed_validation' },
      node_errors: {
        '12': {
          class_type: 'UNETLoader',
          errors: [
            { type: 'required_input_missing', message: '必須入力がありません', details: 'model' },
          ],
          dependent_outputs: ['9'],
        },
      },
    });

    expect(errors).toEqual([
      {
        nodeId: '12',
        classType: 'UNETLoader',
        messages: ['必須入力がありません: model'],
      },
    ]);
  });

  it('node_errors が無ければ空', () => {
    expect(parsePromptErrors({ prompt_id: 'p1', node_errors: {} })).toEqual([]);
    expect(parsePromptErrors(null)).toEqual([]);
  });
});

describe('出力ファイルの参照', () => {
  it('種類ごとのキーを決め打ちせず、filename を持つものを拾う', () => {
    const output = {
      images: [
        { filename: 'a.png', subfolder: '', type: 'output' },
        { filename: 'b.png', subfolder: 'sub', type: 'temp' },
      ],
      gifs: [{ filename: 'c.webm', type: 'output' }],
      text: ['ただの文字列'],
    };

    expect(parseOutputFiles(output)).toEqual([
      { filename: 'a.png', subfolder: '', type: 'output' },
      { filename: 'b.png', subfolder: 'sub', type: 'temp' },
      { filename: 'c.webm', subfolder: '', type: 'output' },
    ]);
  });

  it('想定外の形は空で返す', () => {
    expect(parseOutputFiles(null)).toEqual([]);
    expect(parseOutputFiles({ images: [{ no_filename: 1 }] })).toEqual([]);
  });
});

describe('履歴の 1 件の詳細', () => {
  it('出力をノードごとに分けて読む（subgraph の中のノードの id もそのまま）', () => {
    const image = { filename: 'a.png', subfolder: '', type: 'output' };
    const raw = {
      p1: {
        prompt: [1, 'p1', {}, {}, []],
        outputs: { '9': { images: [image] }, '59:70': { images: [] } },
        status: { status_str: 'success', messages: [] },
      },
    };
    const detail = parseHistoryDetail(raw, 'p1');
    expect(detail?.nodeOutputs['9']).toEqual([image]);
    expect(detail?.nodeOutputs['59:70']).toEqual([]);
    expect(parseHistoryDetail(raw, 'p2')).toBeNull();
  });
});

describe('履歴の失敗の 1 行', () => {
  const entry = (messages: unknown[]): unknown => ({
    p1: { prompt: [1, 'p1', {}, {}, []], outputs: {}, status: { status_str: 'error', messages } },
  });

  it('文にせず、例外の 1 行目か中断かを返す（文は画面の側が作る）', () => {
    const failed = entry([['execution_error', { exception_message: 'OOM\ntrace' }]]);
    const stopped = entry([['execution_interrupted', {}]]);
    expect(parseHistory(failed)[0]?.error).toEqual({ kind: 'error', line: 'OOM' });
    expect(parseHistory(stopped)[0]?.error).toEqual({ kind: 'interrupted', line: null });
  });
});
