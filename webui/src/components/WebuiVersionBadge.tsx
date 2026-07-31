import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Args = { collapsed?: boolean };

export function WebuiVersionBadge({ collapsed = false }: Args) {
  const { t } = useTranslation();
  const version = __WEBUI_VERSION__;
  const commit = __WEBUI_COMMIT__;
  const full = `${version}+${commit}`;
  return (
    <div
      data-testid="webui-version-badge"
      title={t("sidebar.version.tooltip", { defaultValue: "WebUI build", version: full })}
      className={cn(
        "select-none px-2.5 py-1 text-[10px] font-mono text-muted-foreground/60",
        collapsed ? "text-center" : "text-right",
      )}
    >
      v{full}
    </div>
  );
}
