import { createContext, useContext } from "react";

export interface AutomationPanelController {
  open: (turnId: string) => void;
}

export const AutomationPanelContext = createContext<AutomationPanelController | null>(null);

export function useAutomationPanel(): AutomationPanelController | null {
  return useContext(AutomationPanelContext);
}
