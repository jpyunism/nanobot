import { createContext, useContext } from "react";

export interface WorkflowPanelController {
  open: (runId: string) => void;
}

export const WorkflowPanelContext = createContext<WorkflowPanelController | null>(null);

export function useWorkflowPanel(): WorkflowPanelController | null {
  return useContext(WorkflowPanelContext);
}
