import { useCallback, useEffect, useRef, useState } from "react";

import { useClient } from "@/providers/ClientProvider";
import {
  bindChatAgenda as bindChatAgendaApi,
  createAgendaAppointment as createAgendaAppointmentApi,
  deleteAgendaAppointment as deleteAgendaAppointmentApi,
  listAgendaAppointments,
  updateAgendaAppointment as updateAgendaAppointmentApi,
} from "@/lib/agenda-api";
import type {
  AgendaAppointment,
  AgendaCreatePayload,
  InboundEvent,
} from "@/lib/types";

interface AssistantState {
  lastText: string;
  running: boolean;
}

const EMPTY: AssistantState = { lastText: "", running: false };

interface AgendaState {
  appointments: AgendaAppointment[];
  loading: boolean;
  error: string | null;
}

const initialState: AgendaState = {
  appointments: [],
  loading: true,
  error: null,
};

function sortAppointments(appointments: AgendaAppointment[]): AgendaAppointment[] {
  return [...appointments].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
}

export function useAgenda() {
  const { token, client } = useClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [state, setState] = useState<AgendaState>(initialState);
  const [chatKey, setChatKey] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<AssistantState>(EMPTY);
  const chatKeyRef = useRef(chatKey);
  chatKeyRef.current = chatKey;
  const sendingRef = useRef(false);
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const seq = ++refreshSeqRef.current;
    try {
      const payload = await listAgendaAppointments(t);
      if (seq !== refreshSeqRef.current) return;
      setState((prev) => ({
        ...prev,
        appointments: payload.appointments,
        loading: false,
        error: null,
      }));
    } catch (e) {
      if (seq !== refreshSeqRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: errToString(e) }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Lazily create (or reuse) the ephemeral chat bound to the agenda surface.
  // Created on first send so the session-only cleanup never races a fresh chat.
  // chatKey holds the RAW chat_id (uuid) for the WS socket; the prefixed
  // websocket: key is used only for the metadata bind API.
  const ensureChat = useCallback(async (): Promise<string | null> => {
    if (chatKeyRef.current) return chatKeyRef.current;
    if (!client || typeof client.newChat !== "function") return null;
    try {
      const chatId = await client.newChat(10_000, null, {
        agendaAppointment: "__surface__",
      });
      setChatKey(chatId);
      void bindChatAgendaApi(
        tokenRef.current,
        `websocket:${chatId}`,
        "__surface__",
      ).catch(() => undefined);
      return chatId;
    } catch {
      return null;
    }
  }, [client]);

  // Subscribe to inbound events for this chat to show the assistant's last reply.
  useEffect(() => {
    if (!chatKey) {
      setAssistant(EMPTY);
      return;
    }
    const handler = (ev: InboundEvent) => {
      if (ev.event === "message" && !ev.kind) {
        const text = ev.text?.trim();
        if (text) setAssistant((prev) => ({ ...prev, lastText: text }));
      } else if (ev.event === "goal_status") {
        setAssistant((prev) => ({ ...prev, running: ev.status === "running" }));
      } else if (ev.event === "turn_end") {
        setAssistant((prev) => ({ ...prev, running: false }));
        void refresh();
      } else if (ev.event === "delta") {
        const text = ev.text ?? "";
        if (text) setAssistant((prev) => ({ ...prev, lastText: prev.lastText + text }));
      } else if (ev.event === "stream_end") {
        if (ev.text) setAssistant((prev) => ({ ...prev, lastText: ev.text ?? prev.lastText }));
      }
    };
    const unsub = client.onChat(chatKey, handler);
    return () => unsub();
  }, [chatKey, client]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sendingRef.current) return;
      sendingRef.current = true;
      setAssistant({ lastText: "", running: true });
      try {
        let key = chatKeyRef.current;
        if (!key) {
          key = await ensureChat();
        }
        if (!key || !client || typeof client.sendMessage !== "function") {
          setAssistant(EMPTY);
          return;
        }
        client.sendMessage(key, text);
      } finally {
        sendingRef.current = false;
      }
    },
    [client, ensureChat],
  );

  const createAppointment = useCallback(async (payload: AgendaCreatePayload) => {
    const t = tokenRef.current;
    if (!t) return null;
    try {
      const res = await createAgendaAppointmentApi(t, payload);
      if (!res.appointment) throw new Error(res.error ?? "Failed to create appointment");
      const created = res.appointment;
      setState((prev) => ({
        ...prev,
        appointments: sortAppointments([...prev.appointments, created]),
        error: null,
      }));
      return created;
    } catch (e) {
      setState((prev) => ({ ...prev, error: errToString(e) }));
      return null;
    }
  }, []);

  const updateAppointment = useCallback(
    async (appointmentId: string, changes: Partial<AgendaAppointment>) => {
      const t = tokenRef.current;
      if (!t) return null;
      try {
        const res = await updateAgendaAppointmentApi(t, appointmentId, changes);
        if (!res.appointment) throw new Error(res.error ?? "Failed to update appointment");
        const updated = res.appointment;
        setState((prev) => ({
          ...prev,
          appointments: sortAppointments(
            prev.appointments.map((a) => (a.id === appointmentId ? updated : a)),
          ),
          error: null,
        }));
        return updated;
      } catch (e) {
        setState((prev) => ({ ...prev, error: errToString(e) }));
        return null;
      }
    },
    [],
  );

  const removeAppointment = useCallback(async (appointmentId: string) => {
    const t = tokenRef.current;
    if (!t) return false;
    try {
      await deleteAgendaAppointmentApi(t, appointmentId);
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.filter((a) => a.id !== appointmentId),
        error: null,
      }));
      return true;
    } catch (e) {
      setState((prev) => ({ ...prev, error: errToString(e) }));
      return false;
    }
  }, []);

  return {
    ...state,
    refresh,
    createAppointment,
    updateAppointment,
    removeAppointment,
    chatKey,
    assistant,
    sendMessage,
  };
}

function errToString(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type UseAgenda = ReturnType<typeof useAgenda>;
