import { describe, expect, it } from 'vitest';

import { ComfyRequestError } from '@/comfy/client';
import { InvalidBaseUrlError } from '@/comfy/endpoints';
import { PromptRejectedError } from '@/comfy/prompt';
import { WorkflowExistsError, WorkflowNotOwnedError } from '@/comfy/workflows';
import { t } from '@/i18n';
import type { ComfyFailureParams, ComfyFailureReason } from '@/port/connection';
import {
  comfyFailureOf,
  fallbackRequestFailure,
  formatComfyFailure,
  formatHistoryFailure,
  formatRunError,
} from '@/queue/comfy-failure-text';

const TARGET_URL = 'http://127.0.0.1:8188/x';

function failure(reasonCode: ComfyFailureReason, params: ComfyFailureParams = {}): object {
  return { reasonCode, params };
}

describe('通信の失敗の文', () => {
  it('理由ごとに、通信の層が使っていた鍵と値を引く', () => {
    const cases: [object, string][] = [
      [failure('base-url-empty'), t('api.baseUrl.empty')],
      [
        failure('base-url-scheme', { url: 'ftp://a' }),
        t('api.baseUrl.unsupportedScheme', { url: 'ftp://a' }),
      ],
      [
        failure('base-url-invalid', { url: 'http://' }),
        t('api.baseUrl.invalid', { url: 'http://' }),
      ],
      [failure('aborted'), t('api.request.aborted')],
      [failure('timeout', { ms: 30000 }), t('api.request.timeout', { ms: '30000' })],
      [failure('unreachable'), t('api.request.unreachable')],
      [failure('parse'), t('api.request.parse')],
      [failure('http', { status: 404, statusText: 'Not Found' }), 'HTTP 404 Not Found'],
      [failure('fetch-failed', { status: 500 }), t('api.request.fetchFailed', { status: '500' })],
      [failure('upload-unexpected'), t('api.upload.unexpected')],
      [failure('prompt-rejected'), t('api.prompt.rejected')],
      [failure('prompt-rejected', { reason: 'no outputs' }), 'no outputs'],
      [
        failure('workflow-exists', { path: 'a.json' }),
        t('api.workflow.exists', { path: 'a.json' }),
      ],
      [
        failure('workflow-not-owned', { path: 'a.json' }),
        t('api.workflow.notOwned', { path: 'a.json' }),
      ],
    ];
    for (const [value, text] of cases) expect(formatComfyFailure(value)).toBe(text);
  });

  it('通信の層が投げた物を、クラスを見ずに形で文にする', () => {
    expect(formatComfyFailure(new ComfyRequestError('unreachable', TARGET_URL))).toBe(
      t('api.request.unreachable'),
    );
    expect(formatComfyFailure(new InvalidBaseUrlError('base-url-empty', ''))).toBe(
      t('api.baseUrl.empty'),
    );
    expect(formatComfyFailure(new PromptRejectedError([], null))).toBe(t('api.prompt.rejected'));
    expect(formatComfyFailure(new WorkflowExistsError('b.json', true))).toBe(
      t('api.workflow.exists', { path: 'b.json' }),
    );
    expect(formatComfyFailure(new WorkflowNotOwnedError('b.json'))).toBe(
      t('api.workflow.notOwned', { path: 'b.json' }),
    );
  });

  it('理由の符号を持たない値は、もとの文に戻す', () => {
    expect(formatComfyFailure(new Error('boom'))).toBe('boom');
    expect(formatComfyFailure('text')).toBe('text');
    expect(formatComfyFailure({ reasonCode: 'nope', params: {} })).toBe('[object Object]');
    expect(comfyFailureOf(new DOMException('x', 'AbortError'))).toBeNull();
    expect(comfyFailureOf({ reasonCode: 'ECONNREFUSED', params: {} })).toBeNull();
  });

  it('値の型が合わない項目は拾わない', () => {
    expect(
      comfyFailureOf({ reasonCode: 'timeout', params: { ms: '5' } })?.params.ms,
    ).toBeUndefined();
  });

  it('窓口が記録に変えられなかった値は、届かなかった失敗にし、符号があれば残す', () => {
    expect(fallbackRequestFailure(new Error('x'), TARGET_URL).reasonCode).toBe('unreachable');
    const invalid = fallbackRequestFailure(
      new InvalidBaseUrlError('base-url-scheme', 'ftp://a'),
      TARGET_URL,
    );
    expect(invalid).toMatchObject({
      kind: 'unreachable',
      reasonCode: 'base-url-scheme',
      url: TARGET_URL,
    });
  });
});

describe('実行の失敗の 1 行', () => {
  it('文面が無ければ既定の文にし、中断はそう書く', () => {
    expect(formatRunError('CUDA out of memory')).toBe('CUDA out of memory');
    expect(formatRunError(null)).toBe(t('api.run.error'));
    expect(formatHistoryFailure(null)).toBeNull();
    expect(formatHistoryFailure({ kind: 'interrupted', line: null })).toBe(
      t('api.run.interrupted'),
    );
    expect(formatHistoryFailure({ kind: 'error', line: null })).toBe(t('api.run.error'));
    expect(formatHistoryFailure({ kind: 'error', line: 'boom' })).toBe('boom');
  });
});
