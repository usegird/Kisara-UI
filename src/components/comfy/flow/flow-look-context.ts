import { createContext } from 'react';

export interface FlowLook {
  readonly appImport: boolean;
  readonly appRemove: boolean;
  readonly commentBelow: boolean;
  readonly chipOutputs: boolean;
  readonly roomy: boolean;
  readonly compact: boolean;
}

const DEFAULT_FLOW_LOOK: FlowLook = {
  appImport: true,
  appRemove: true,
  commentBelow: false,
  chipOutputs: false,
  roomy: false,
  compact: false,
};

export const FlowLookContext = createContext<FlowLook>(DEFAULT_FLOW_LOOK);
