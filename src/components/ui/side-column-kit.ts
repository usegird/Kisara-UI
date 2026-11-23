import type { SideColumnKey } from '@/store/settings-fields/column-widths';

type SideColumnAlert = 'error' | 'warning' | 'none';

interface SideColumnSection {
  readonly value: string;
  readonly label: string;
  readonly alert?: SideColumnAlert | undefined;
}

export interface SideColumnKit {
  readonly label: string;
  readonly dockable?: boolean | undefined;
  readonly bottomEdge?: 'scrollbar' | 'input' | undefined;
  readonly widthKey?: SideColumnKey | undefined;
  readonly attachPanel?: ((element: HTMLElement | null) => void) | undefined;
  readonly attachTabs?: ((element: HTMLElement | null) => void) | undefined;
  readonly sections: readonly SideColumnSection[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  readonly renderTabExtra?: ((value: string) => React.ReactNode) | undefined;
  readonly renderRailIcon: (value: string) => React.ReactNode;
  readonly renderContent: (value: string, wrap: boolean) => React.ReactNode;
}
