import { useCallback, useEffect, useRef, useState } from "react";

import { useClient } from "@/providers/ClientProvider";
import {
  createAgendaAppointment as createAgendaAppointmentApi,
  deleteAgendaAppointment as deleteAgendaAppointmentApi,
  listAgendaAppointments,
  updateAgendaAppointment as updateAgendaAppointmentApi,
} from "@/lib/agenda-api";
import type {
  AgendaAppointment,
  AgendaCreatePayload,
} from "@/lib/types";

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
  const { token } = useClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [state, setState] = useState<AgendaState>(initialState);
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
  };
}

function errToString(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type UseAgenda = ReturnType<typeof useAgenda>;
