import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addBoardCard,
  addBoardColumn,
  buildBoardCard,
  deleteBoardCard,
  fetchBoard,
  fetchBoardCardSubagent,
  mergeBoardCard,
  moveBoardCard,
  planBoardCard,
  removeBoardColumn,
  renameBoardColumn,
  setBoardCardChat,
  setupBoard,
  spawnBoardCard,
  validateBoardCard,
  ProjectApiError,
} from "@/lib/projects";
import type { Board, BoardCard } from "@/lib/types";

export type BoardState = {
  board: Board | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setup: (repoPath: string) => Promise<void>;
  addColumn: (name: string) => Promise<void>;
  removeColumn: (columnId: string) => Promise<void>;
  renameColumn: (columnId: string, name: string) => Promise<void>;
  addCard: (brief: string, columnId: string) => Promise<BoardCard>;
  moveCard: (cardId: string, columnId: string) => Promise<void>;
  setCardChat: (cardId: string, sessionKey: string) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  mergeCard: (cardId: string, into: string) => Promise<string>;
  spawnCard: (cardId: string) => Promise<void>;
  planCard: (cardId: string) => Promise<void>;
  buildCard: (cardId: string) => Promise<void>;
  validateCard: (cardId: string) => Promise<void>;
  cardSubagentStatus: (cardId: string) => Promise<Record<string, unknown> | null>;
};

export function useBoard(
  base: string,
  token: string,
  projectId: string | null,
): BoardState {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setBoard(await fetchBoard(base, token, projectId));
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [base, token, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setup = useCallback(
    async (repoPath: string) => {
      if (!projectId) return;
      setError(null);
      try {
        setBoard(await setupBoard(base, token, projectId, repoPath));
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId],
  );

  const addColumn = useCallback(
    async (name: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await addBoardColumn(base, token, projectId, name);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const removeColumn = useCallback(
    async (columnId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await removeBoardColumn(base, token, projectId, columnId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const renameColumn = useCallback(
    async (columnId: string, name: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await renameBoardColumn(base, token, projectId, columnId, name);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const addCard = useCallback(
    async (brief: string, columnId: string) => {
      if (!projectId) throw new Error("no project");
      setError(null);
      const card = await addBoardCard(base, token, projectId, brief, columnId);
      await refresh();
      return card;
    },
    [base, token, projectId, refresh],
  );

  const moveCard = useCallback(
    async (cardId: string, columnId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await moveBoardCard(base, token, projectId, cardId, columnId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const setCardChat = useCallback(
    async (cardId: string, sessionKey: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await setBoardCardChat(base, token, projectId, cardId, sessionKey);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await deleteBoardCard(base, token, projectId, cardId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const mergeCard = useCallback(
    async (cardId: string, into: string) => {
      if (!projectId) throw new Error("no project");
      setError(null);
      const res = await mergeBoardCard(base, token, projectId, cardId, into);
      await refresh();
      return res.output;
    },
    [base, token, projectId, refresh],
  );

  const spawnCard = useCallback(
    async (cardId: string) => {
      if (!projectId) throw new Error("no project");
      setError(null);
      try {
        await spawnBoardCard(base, token, projectId, cardId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const planCard = useCallback(
    async (cardId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await planBoardCard(base, token, projectId, cardId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const buildCard = useCallback(
    async (cardId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await buildBoardCard(base, token, projectId, cardId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const validateCard = useCallback(
    async (cardId: string) => {
      if (!projectId) return;
      setError(null);
      try {
        await validateBoardCard(base, token, projectId, cardId);
        await refresh();
      } catch (err) {
        setError(toMessage(err));
      }
    },
    [base, token, projectId, refresh],
  );

  const cardSubagentStatus = useCallback(
    async (cardId: string) => {
      if (!projectId) return null;
      const res = await fetchBoardCardSubagent(base, token, projectId, cardId);
      if (res && "status" in res && res.status === null) return null;
      return res as Record<string, unknown>;
    },
    [base, token, projectId],
  );

  return useMemo(
    () => ({
      board,
      loading,
      error,
      refresh,
      setup,
      addColumn,
      removeColumn,
      renameColumn,
      addCard,
      moveCard,
      setCardChat,
      deleteCard,
      mergeCard,
      spawnCard,
      planCard,
      buildCard,
      validateCard,
      cardSubagentStatus,
    }),
    [
      board,
      loading,
      error,
      refresh,
      setup,
      addColumn,
      removeColumn,
      renameColumn,
      addCard,
      moveCard,
      setCardChat,
      deleteCard,
      mergeCard,
      spawnCard,
      planCard,
      buildCard,
      validateCard,
      cardSubagentStatus,
    ],
  );
}

function toMessage(err: unknown): string {
  if (err instanceof ProjectApiError) return `${err.status} ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
