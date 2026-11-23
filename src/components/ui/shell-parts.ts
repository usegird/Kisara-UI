import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

export interface ShellContext {
  readonly anchors: AnchorRegistry;
  readonly openOther: (file: File) => Promise<boolean>;
}

export interface ShellParts {
  readonly active?: boolean | undefined;
  readonly dock?: 'right' | undefined;
  readonly navToggle: React.ReactNode;
  readonly tabMenu: React.ReactNode;
  readonly tabMoveMenu?: React.ReactNode;
  readonly onRename: (next: string) => void;
  readonly workspace: React.ReactNode;
  readonly side: React.ReactNode;
  readonly overlay: React.ReactNode;
  readonly overlayOnOthers: React.ReactNode;
  readonly header: React.ReactNode;
  readonly background: React.ReactNode;
  readonly toasts: React.ReactNode;
  readonly dialogs: React.ReactNode;
  readonly windows: React.ReactNode;
}

export interface ShellKind {
  readonly useParts: (context: ShellContext) => ShellParts;
  readonly openFile?: ((file: File) => Promise<boolean>) | undefined;
}
