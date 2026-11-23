type ToolCallKind = 'workflow';

export interface ToolApprovalInput {
  readonly kind: ToolCallKind;
  readonly skipConfirm: boolean;
  readonly fresh: boolean;
  readonly connected: boolean;
}

export function runsWithoutConfirm(input: ToolApprovalInput): boolean {
  return input.kind === 'workflow' && input.skipConfirm && input.fresh && input.connected;
}
