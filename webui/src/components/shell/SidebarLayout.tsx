import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  MOBILE_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH,
} from "@/hooks/useHostSidebarLayout";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

type SidebarBaseProps = ComponentProps<typeof Sidebar>;

type Args = {
  showHostChrome: boolean;
  showMainSidebar: boolean;
  hostSidebarOpen: boolean;
  hostSidebarPreviewOpen: boolean;
  hostSidebarFlowWidth: number;
  renderHostSidebarFlowContent: boolean;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  closeHostSidebar: () => void;
  openHostSidebar: () => void;
  openHostSidebarPreview: () => void;
  scheduleHostSidebarPreviewClose: () => void;
  closeMobileSidebar: () => void;
  sidebarProps: Omit<SidebarBaseProps, "onCollapse" | "onExpand" | "containActionMenus" | "hostChromeInset" | "collapsed">;
};

export function SidebarLayout({
  showHostChrome,
  showMainSidebar,
  hostSidebarOpen,
  hostSidebarPreviewOpen,
  hostSidebarFlowWidth,
  renderHostSidebarFlowContent,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  closeHostSidebar,
  openHostSidebar,
  openHostSidebarPreview,
  scheduleHostSidebarPreviewClose,
  closeMobileSidebar,
  sidebarProps,
}: Args) {
  const { t } = useTranslation();

  if (!showMainSidebar) return null;

  return (
    <>
      <aside
        data-testid="host-sidebar-flow"
        className={cn(
          "relative z-20 hidden shrink-0 overflow-hidden lg:block",
          "transition-[width] duration-300 ease-out",
        )}
        style={{ width: hostSidebarFlowWidth }}
      >
        {renderHostSidebarFlowContent ? (
          <div
            className={cn(
              "absolute inset-y-0 left-0 h-full w-full overflow-hidden",
              showHostChrome ? "host-sidebar-glass" : "bg-sidebar",
            )}
          >
            <Sidebar
              {...sidebarProps}
              collapsed={!showHostChrome && !hostSidebarOpen}
              hostChromeInset={showHostChrome}
              onCollapse={closeHostSidebar}
              onExpand={openHostSidebar}
            />
          </div>
        ) : null}
      </aside>

      {hostSidebarPreviewOpen ? (
        <aside
          data-testid="host-sidebar-preview"
          className="absolute inset-y-0 left-0 z-30 hidden overflow-hidden lg:block animate-in fade-in-0 slide-in-from-left-2 duration-150"
          style={{ width: SIDEBAR_WIDTH }}
          onMouseEnter={openHostSidebarPreview}
          onMouseLeave={scheduleHostSidebarPreviewClose}
        >
          <div className="h-full w-full overflow-hidden host-sidebar-glass shadow-2xl">
            <Sidebar
              {...sidebarProps}
              hostChromeInset={showHostChrome}
              onCollapse={closeHostSidebar}
              onExpand={openHostSidebar}
            />
          </div>
        </aside>
      ) : null}

      <Sheet
        open={mobileSidebarOpen}
        onOpenChange={(open) => setMobileSidebarOpen(open)}
      >
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          className="p-0 lg:hidden"
          style={{ width: MOBILE_SIDEBAR_WIDTH, maxWidth: MOBILE_SIDEBAR_WIDTH }}
        >
          <SheetTitle className="sr-only">{t("sidebar.navigation")}</SheetTitle>
          <Sidebar
            {...sidebarProps}
            onCollapse={closeMobileSidebar}
            containActionMenus
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
