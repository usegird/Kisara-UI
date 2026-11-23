interface SystemDevice {
  readonly type: string | null;
  readonly name: string | null;
  readonly vramTotal: number | null;
}

export interface SystemStats {
  readonly comfyuiVersion: string | null;
  readonly pythonVersion: string | null;
  readonly pytorchVersion: string | null;
  readonly os: string | null;
  readonly devices: readonly SystemDevice[];
}
