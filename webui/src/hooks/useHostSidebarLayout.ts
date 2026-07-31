import { useCallback, useEffect, useRef, useState } from "react";
import { writeSidebarOpen } from "@/lib/sidebar-state-keys";

export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_RAIL_WIDTH = 56;
export const MOBILE_SIDEBAR_WIDTH = `min(${SIDEBAR_WIDTH}px, calc(100vw - 0.75rem))`;

const HOST_SIDEBAR_PREVIEW_CLOSE_DELAY_MS = 160;

type Args = {
  showHostChrome: boolean;
  showMainSidebar: boolean;
};

export function useHostSidebarLayout({ showHostChrome, showMainSidebar }: Args) {
  const [hostSidebarOpen, setHostSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("nanobot-webui.sidebar") !== "0";
    } catch {
      return true;
    }
  });
  const [hostSidebarPreviewOpen, setHostSidebarPreviewOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const previewCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    writeSidebarOpen(hostSidebarOpen);
  }, [hostSidebarOpen]);

  const clearPreviewCloseTimer = useCallback(() => {
    if (previewCloseTimerRef.current === null) return;
    window.clearTimeout(previewCloseTimerRef.current);
    previewCloseTimerRef.current = null;
  }, []);

  const closePreview = useCallback(() => {
    clearPreviewCloseTimer();
    setHostSidebarPreviewOpen(false);
  }, [clearPreviewCloseTimer]);

  const openPreview = useCallback(() => {
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) return;
    clearPreviewCloseTimer();
    setHostSidebarPreviewOpen(true);
  }, [clearPreviewCloseTimer, hostSidebarOpen, showHostChrome, showMainSidebar]);

  const schedulePreviewClose = useCallback(() => {
    clearPreviewCloseTimer();
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) {
      setHostSidebarPreviewOpen(false);
      return;
    }
    previewCloseTimerRef.current = window.setTimeout(() => {
      setHostSidebarPreviewOpen(false);
      previewCloseTimerRef.current = null;
    }, HOST_SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
  }, [clearPreviewCloseTimer, hostSidebarOpen, showHostChrome, showMainSidebar]);

  useEffect(
    () => () => clearPreviewCloseTimer(),
    [clearPreviewCloseTimer],
  );

  useEffect(() => {
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) {
      closePreview();
    }
  }, [closePreview, hostSidebarOpen, showHostChrome, showMainSidebar]);

  const closeHost = useCallback(() => {
    closePreview();
    setHostSidebarOpen(false);
  }, [closePreview]);

  const openHost = useCallback(() => {
    closePreview();
    setHostSidebarOpen(true);
  }, [closePreview]);

  const toggleHost = useCallback(() => {
    closePreview();
    setHostSidebarOpen((v) => !v);
  }, [closePreview]);

  const closeMobile = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    const isNativeHost =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (isNativeHost) {
      closePreview();
      setHostSidebarOpen((v) => !v);
    } else {
      setMobileSidebarOpen((v) => !v);
    }
  }, [closePreview]);

  const hostSidebarCollapsed = showHostChrome && !hostSidebarOpen;
  const showHostSidebarPreview =
    showMainSidebar && hostSidebarCollapsed && hostSidebarPreviewOpen;
  const hostSidebarFlowWidth = showHostChrome
    ? hostSidebarOpen
      ? SIDEBAR_WIDTH
      : 0
    : hostSidebarOpen
      ? SIDEBAR_WIDTH
      : SIDEBAR_RAIL_WIDTH;
  const renderHostSidebarFlowContent = !showHostChrome || hostSidebarOpen;

  return {
    hostSidebarOpen,
    hostSidebarPreviewOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    closePreview,
    openPreview,
    schedulePreviewClose,
    closeHost,
    openHost,
    toggleHost,
    closeMobile,
    toggleSidebar,
    hostSidebarCollapsed,
    showHostSidebarPreview,
    hostSidebarFlowWidth,
    renderHostSidebarFlowContent,
  };
}
