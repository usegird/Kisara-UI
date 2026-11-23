import { ComfyRequestError, postJson, type RequestOptions } from '@/comfy/client';
import { interruptUrl, promptUrl } from '@/comfy/endpoints';
import { developerMessage } from '@/comfy/request-error';
import { parsePromptErrors, parsePromptResponse } from '@/comfy/schema';
import { isRecord } from '@/lib/guards';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';
import type { PromptAccepted, PromptNodeError, SubmitPromptParams } from '@/port/run';

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
  if (!isRecord(body)) return null;

  const { error } = body;
  if (typeof error === 'string') return error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return null;
}

function extraDataOf(params: SubmitPromptParams): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  if (params.workflow !== undefined) extra.extra_pnginfo = { workflow: params.workflow };
  if (params.session !== undefined) extra.kisara = { session: params.session };
  return Object.keys(extra).length === 0 ? undefined : extra;
}

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

export async function interruptRun(
  baseUrl: string,
  promptId: string,
  options: RequestOptions = {},
): Promise<void> {
  await postJson(interruptUrl(baseUrl), { prompt_id: promptId }, options);
}
