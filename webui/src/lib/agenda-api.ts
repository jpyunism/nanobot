import type {
  AgendaAppointment,
  AgendaCreatePayload,
  AgendaDetailPayload,
  AgendaListPayload,
} from "./types";
import { fetchWithTimeout } from "./http";

const API_READ_TIMEOUT_MS = 20_000;
const AGENDA_DATA_HEADER = "X-Nanobot-Agenda-Data";

async function agendaRequest<T>(
  url: string,
  token: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (data !== undefined) {
    headers[AGENDA_DATA_HEADER] = JSON.stringify(data);
  }
  const init: RequestInit = { method: "GET", headers };
  if (signal) init.signal = signal;
  const res = await fetchWithTimeout(url, init, API_READ_TIMEOUT_MS);
  if (!res.ok) {
    let message = `Agenda API error ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "error" in body) {
        const err = (body as { error?: unknown }).error;
        if (typeof err === "string") message = err;
      }
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function listAgendaAppointments(
  token: string,
  base: string = "",
): Promise<AgendaListPayload> {
  return agendaRequest<AgendaListPayload>(`${base}/api/agenda`, token);
}

export async function fetchAgendaAppointment(
  token: string,
  appointmentId: string,
  base: string = "",
): Promise<AgendaDetailPayload> {
  return agendaRequest<AgendaDetailPayload>(
    `${base}/api/agenda/${encodeURIComponent(appointmentId)}`,
    token,
  );
}

export async function createAgendaAppointment(
  token: string,
  payload: AgendaCreatePayload,
  base: string = "",
): Promise<AgendaDetailPayload> {
  return agendaRequest<AgendaDetailPayload>(
    `${base}/api/agenda/create`,
    token,
    payload,
  );
}

export async function updateAgendaAppointment(
  token: string,
  appointmentId: string,
  changes: Partial<AgendaAppointment>,
  base: string = "",
): Promise<AgendaDetailPayload> {
  return agendaRequest<AgendaDetailPayload>(
    `${base}/api/agenda/${encodeURIComponent(appointmentId)}/update`,
    token,
    changes,
  );
}

export async function deleteAgendaAppointment(
  token: string,
  appointmentId: string,
  base: string = "",
): Promise<{ ok: boolean; id: string }> {
  return agendaRequest<{ ok: boolean; id: string }>(
    `${base}/api/agenda/${encodeURIComponent(appointmentId)}/delete`,
    token,
  );
}

export async function bindChatAgenda(
  token: string,
  sessionKey: string,
  appointmentId: string,
  base: string = "",
): Promise<{ session_key: string; agenda_appointment: string }> {
  const query = new URLSearchParams({ appointment_id: appointmentId });
  return agendaRequest<{ session_key: string; agenda_appointment: string }>(
    `${base}/api/sessions/${encodeURIComponent(sessionKey)}/agenda/bind?${query}`,
    token,
  );
}

export async function unbindChatAgenda(
  token: string,
  sessionKey: string,
  base: string = "",
): Promise<{ session_key: string; agenda_appointment: null }> {
  return agendaRequest<{ session_key: string; agenda_appointment: null }>(
    `${base}/api/sessions/${encodeURIComponent(sessionKey)}/agenda/unbind`,
    token,
  );
}
