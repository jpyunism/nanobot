import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HostChrome } from "@/components/HostChrome";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";

type Args = {
  showMainSidebar: boolean;
  showChat: boolean;
  toggleHostSidebar: () => void;
  openHostSidebarPreview: () => void;
  scheduleHostSidebarPreviewClose: () => void;
  hostSidebarOpen: boolean;
};

export function ShellNativeHeader({
  showMainSidebar,
  showChat,
  toggleHostSidebar,
  openHostSidebarPreview,
  scheduleHostSidebarPreviewClose,
  hostSidebarOpen,
}: Args) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <HostChrome
      onToggleSidebar={showMainSidebar ? toggleHostSidebar : undefined}
      onSidebarPreviewEnter={openHostSidebarPreview}
      onSidebarPreviewLeave={scheduleHostSidebarPreviewClose}
      sidebarOpen={hostSidebarOpen}
      rightAction={
        showChat ? undefined : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("thread.header.toggleTheme")}
            onClick={toggle}
            className="h-8 w-8 rounded-full text-muted-foreground/85 hover:bg-accent/40 hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        )
      }
    />
  );
}
