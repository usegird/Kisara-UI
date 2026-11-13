import { ComfyRequestError, postJson, type RequestOptions } from '@/comfy/client';
import { interruptUrl, promptUrl } from '@/comfy/endpoints';
import { developerMessage } from '@/comfy/request-error';
import { parsePromptErrors, parsePromptResponse } from '@/comfy/schema';
import { isRecord } from '@/lib/guards';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';
import type { PromptAccepted, PromptNodeError, SubmitPromptParams } from '@/port/run';

// ─────────────────────────────
// ワークフローの実行と中断。**GPU を消費する**ので、明示の操作を経ずに呼ばない（テストはモックで代替）。
// ─────────────────────────────

/** 受理されなかったとき。どのノードが弾かれたかを持つ */
export class PromptRejectedError extends Error implements ComfyFailure {
  readonly nodeErrors: readonly PromptNodeError[];
  readonly reason: string | null;
  readonly reasonCode = 'prompt-rejected';
  readonly params: ComfyFailureParams;

  constructor(nodeErrors: readonly PromptNodeError[], reason: string | null) {
    const params = reason === null ? {} : { reason };
    super(developerMessage('prompt-rejected', params));
    this.name = 'PromptRejectedError';
    this.nodeErrors = nodeErrors;
    this.reason = reason;
    this.params = params;
  }
}

function reasonOf(body: unknown): string | null {
  // 配列は鍵 `error`・`message` を持たないので、弾いても結果は変わらない
  if (!isRecord(body)) return null;

  const { error } = body;
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return null;
}

/** `extra_data`。画像に埋め込ませる Workflow JSON とセッションの id。どちらも無ければ undefined */
function extraDataOf(params: SubmitPromptParams): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  if (params.workflow !== undefined) extra.extra_pnginfo = { workflow: params.workflow };
  if (params.session !== undefined) extra.kisara = { session: params.session };
  return Object.keys(extra).length === 0 ? undefined : extra;
}

/**
 * `POST /prompt`。受理されれば prompt_id を返す。
 * 400 の検証エラーは `PromptRejectedError` に変えて、ノード単位の理由を残す。
 */
export async function submitPrompt(
  baseUrl: string,
  params: SubmitPromptParams,
  options: RequestOptions = {},
): Promise<PromptAccepted> {
  const url = promptUrl(baseUrl);
  let raw: unknown;

  try {
    const extraData = extraDataOf(params);
    const body = {
      prompt: params.prompt,
      client_id: params.clientId,
      ...(extraData === undefined ? {} : { extra_data: extraData }),
    };
    raw = await postJson(url, body, options);
  } catch (error) {
    if (error instanceof ComfyRequestError && error.kind === 'http') {
      const nodeErrors = parsePromptErrors(error.body);
      const reason = reasonOf(error.body);
      if (nodeErrors.length > 0 || reason !== null) {
        throw new PromptRejectedError(nodeErrors, reason);
      }
    }
    throw error;
  }

  const accepted = parsePromptResponse(raw);
  if (accepted === null) {
    throw new PromptRejectedError(parsePromptErrors(raw), reasonOf(raw));
  }
  return accepted;
}

/**
 * `POST /interrupt`。**その実行だけ**を止める（キューには残る）。
 * `prompt_id` を添えると、接続先はその実行が走っているときだけ止める（ほかの画面・本体の画面の
 * 実行を止めない。`server.py` の `/interrupt`）
 */
export async function interruptRun(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<void> {
  await postJson(interruptUrl(baseUrl), { prompt_id: promptId }, options);
}
