import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import {
  fetchPairingRequests,
  runPairingAction,
} from "@/lib/api";
import type { PairingRequestInfo } from "@/lib/types";

const PAIRING_POLL_INTERVAL_MS = 5_000;
const PAIRING_IDLE_POLL_INTERVAL_MS = 15_000;
const PAIRING_DISMISS_SNOOZE_MS = 30_000;

export type PairingApi = {
  visibleRequests: PairingRequestInfo[];
  busyCode: string | null;
  error: string | null;
  onPairingAction: (action: "approve" | "deny", code: string) => Promise<void>;
  onDismissPairingRequest: (code: string) => void;
  refresh: () => Promise<number>;
};

export function usePairing(token: string): PairingApi {
  const pageVisible = usePageVisibility();
  const [requests, setRequests] = useState<PairingRequestInfo[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState<Map<string, number>>(() => new Map());

  const refresh = useCallback(async (): Promise<number> => {
    try {
      const payload = await fetchPairingRequests(token);
      const next = Array.isArray(payload.requests) ? payload.requests : [];
      setRequests(next);
      setSnoozed((current) => {
        if (current.size === 0) return current;
        const activeCodes = new Set(next.map((r) => r.code));
        const now = Date.now();
        const filtered = new Map(
          Array.from(current).filter(
            ([code, snoozedUntil]) => activeCodes.has(code) && snoozedUntil > now,
          ),
        );
        return filtered.size === current.size ? current : filtered;
      });
      return next.length;
    } catch {
      return 0;
    }
  }, [token]);

  useEffect(() => {
    if (!pageVisible) return undefined;
    let disposed = false;
    let timer: number | null = null;
    const poll = async () => {
      const count = await refresh();
      if (disposed) return;
      timer = window.setTimeout(
        () => void poll(),
        count > 0 ? PAIRING_POLL_INTERVAL_MS : PAIRING_IDLE_POLL_INTERVAL_MS,
      );
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pageVisible, refresh]);

  const onPairingAction = useCallback(
    async (action: "approve" | "deny", code: string) => {
      setBusyCode(code);
      setError(null);
      try {
        const payload = await runPairingAction(token, action, code);
        setRequests(Array.isArray(payload.requests) ? payload.requests : []);
        setSnoozed((current) => {
          if (!current.has(code)) return current;
          const next = new Map(current);
          next.delete(code);
          return next;
        });
      } catch (e) {
        setError((e as Error).message);
        void refresh();
      } finally {
        setBusyCode(null);
      }
    },
    [refresh, token],
  );

  const onDismissPairingRequest = useCallback((code: string) => {
    setSnoozed((current) => {
      const snoozedUntil = Date.now() + PAIRING_DISMISS_SNOOZE_MS;
      if (current.get(code) === snoozedUntil) return current;
      const next = new Map(current);
      next.set(code, snoozedUntil);
      return next;
    });
  }, []);

  const visibleRequests = useMemo(() => {
    const now = Date.now();
    return requests.filter((request) => {
      const snoozedUntil = snoozed.get(request.code);
      return !snoozedUntil || snoozedUntil <= now;
    });
  }, [requests, snoozed]);

  return {
    visibleRequests,
    busyCode,
    error,
    onPairingAction,
    onDismissPairingRequest,
    refresh,
  };
}
