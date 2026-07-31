import { createContext, useContext } from "react";

export interface SubagentPanelController {
  /** Open the side panel for the given subagent task id. */
  open: (taskId: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const SubagentPanelContext = createContext<SubagentPanelController | null>(null);

export function useSubagentPanel(): SubagentPanelController | null {
  return useContext(SubagentPanelContext);
}
