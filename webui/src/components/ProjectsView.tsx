import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";

export function ProjectsView() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
          <FolderKanban className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            {t("projects.title", { defaultValue: "Projects" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("projects.comingSoon", {
              defaultValue:
                "First-class project capsules are coming soon. They'll bundle a project's files, instructions, and a focused chat workspace.",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
