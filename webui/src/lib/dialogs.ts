import { useCallback, useReducer } from "react";
import type { SessionAutomationJob } from "@/lib/types";

export type PendingDelete = {
  key: string;
  label: string;
  automations?: SessionAutomationJob[];
};

export type PendingRename = {
  key: string;
  label: string;
};

type DialogsState = {
  sessionSearchOpen: boolean;
  pendingDelete: PendingDelete | null;
  pendingRename: PendingRename | null;
  pendingProjectRename: PendingRename | null;
};

type DialogsAction =
  | { type: "OPEN_SESSION_SEARCH" }
  | { type: "CLOSE_SESSION_SEARCH" }
  | { type: "OPEN_DELETE"; payload: PendingDelete }
  | { type: "CLOSE_DELETE" }
  | { type: "OPEN_RENAME"; payload: PendingRename }
  | { type: "CLOSE_RENAME" }
  | { type: "OPEN_PROJECT_RENAME"; payload: PendingRename }
  | { type: "CLOSE_PROJECT_RENAME" };

const initialState: DialogsState = {
  sessionSearchOpen: false,
  pendingDelete: null,
  pendingRename: null,
  pendingProjectRename: null,
};

function reducer(state: DialogsState, action: DialogsAction): DialogsState {
  switch (action.type) {
    case "OPEN_SESSION_SEARCH":
      return { ...state, sessionSearchOpen: true };
    case "CLOSE_SESSION_SEARCH":
      return state.sessionSearchOpen ? { ...state, sessionSearchOpen: false } : state;
    case "OPEN_DELETE":
      return { ...state, pendingDelete: action.payload };
    case "CLOSE_DELETE":
      return state.pendingDelete === null ? state : { ...state, pendingDelete: null };
    case "OPEN_RENAME":
      return { ...state, pendingRename: action.payload };
    case "CLOSE_RENAME":
      return state.pendingRename === null ? state : { ...state, pendingRename: null };
    case "OPEN_PROJECT_RENAME":
      return { ...state, pendingProjectRename: action.payload };
    case "CLOSE_PROJECT_RENAME":
      return state.pendingProjectRename === null
        ? state
        : { ...state, pendingProjectRename: null };
    default:
      return state;
  }
}

export type DialogsApi = DialogsState & {
  openSessionSearch: () => void;
  closeSessionSearch: () => void;
  requestDelete: (payload: PendingDelete) => void;
  cancelDelete: () => void;
  requestRename: (payload: PendingRename) => void;
  cancelRename: () => void;
  requestProjectRename: (payload: PendingRename) => void;
  cancelProjectRename: () => void;
};

export function useDialogsState(): DialogsApi {
  const [state, dispatch] = useReducer(reducer, initialState);

  const openSessionSearch = useCallback(() => dispatch({ type: "OPEN_SESSION_SEARCH" }), []);
  const closeSessionSearch = useCallback(() => dispatch({ type: "CLOSE_SESSION_SEARCH" }), []);
  const requestDelete = useCallback(
    (payload: PendingDelete) => dispatch({ type: "OPEN_DELETE", payload }),
    [],
  );
  const cancelDelete = useCallback(() => dispatch({ type: "CLOSE_DELETE" }), []);
  const requestRename = useCallback(
    (payload: PendingRename) => dispatch({ type: "OPEN_RENAME", payload }),
    [],
  );
  const cancelRename = useCallback(() => dispatch({ type: "CLOSE_RENAME" }), []);
  const requestProjectRename = useCallback(
    (payload: PendingRename) => dispatch({ type: "OPEN_PROJECT_RENAME", payload }),
    [],
  );
  const cancelProjectRename = useCallback(
    () => dispatch({ type: "CLOSE_PROJECT_RENAME" }),
    [],
  );

  return {
    ...state,
    openSessionSearch,
    closeSessionSearch,
    requestDelete,
    cancelDelete,
    requestRename,
    cancelRename,
    requestProjectRename,
    cancelProjectRename,
  };
}
