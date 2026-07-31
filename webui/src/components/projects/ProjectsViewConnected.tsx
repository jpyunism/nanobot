import { lazy, Suspense } from "react";

import { useClient } from "@/providers/ClientProvider";
import type { ProjectClientApi } from "@/components/projects/ProjectsView";

const LazyProjectsView = lazy(() =>
  import("@/components/projects/ProjectsView").then((m) => ({ default: m.ProjectsView })),
);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("file read returned non-string"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

interface ProjectsViewConnectedProps {
  token: string | null;
  baseUrl?: string;
  onBackToChat: () => void;
}

export function ProjectsViewConnected({
  token,
  baseUrl,
  onBackToChat,
}: ProjectsViewConnectedProps) {
  const ctx = useClient();
  const clientApi: ProjectClientApi | null = ctx.client
    ? {
        uploadFile: async (projectId: string, file: File) => {
          const dataUrl = await readFileAsDataUrl(file);
          await ctx.client.addProjectFile(projectId, file.name, dataUrl);
        },
        bindChatToProject: async (chatId: string, projectId: string) => {
          await ctx.client.bindProject(chatId, projectId);
        },
        unbindChatFromProject: async (chatId: string) => {
          await ctx.client.unbindProject(chatId);
        },
      }
    : null;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <LazyProjectsView
        token={token}
        baseUrl={baseUrl}
        clientApi={clientApi}
        onBackToChat={onBackToChat}
      />
    </Suspense>
  );
}
