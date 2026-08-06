import { fetchWithTimeout } from "./http";

const API_READ_TIMEOUT_MS = 60_000;

export interface ResearchSharePayload {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function shareResearchArticle(
  token: string,
  path: string,
  base: string = "",
): Promise<ResearchSharePayload> {
  const query = new URLSearchParams();
  query.set("path", path);
  const res = await fetchWithTimeout(
    `${base}/api/research/share?${query}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
    API_READ_TIMEOUT_MS,
  );
  if (!res.ok) {
    let message = `Share failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "error" in body) {
        message = String(body.error || message);
      }
    } catch {
      // ignore
    }
    return { ok: false, error: message };
  }
  return (await res.json()) as ResearchSharePayload;
}

export async function fetchSharemdInfo(
  token: string,
  path: string,
  base: string = "",
): Promise<{ url: string } | null> {
  const query = new URLSearchParams();
  query.set("path", path);
  try {
    const res = await fetchWithTimeout(
      `${base}/api/workspace-browser/read?${query}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      API_READ_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: string; error?: string };
    if (body.error || !body.content) return null;
    const data = JSON.parse(body.content);
    return data && typeof data.url === "string" ? { url: data.url } : null;
  } catch {
    return null;
  }
}
