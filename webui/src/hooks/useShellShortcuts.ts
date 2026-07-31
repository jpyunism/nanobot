import { useEffect } from "react";

type Args = {
  onNewChat: () => void;
  onOpenSessionSearch: () => void;
};

export function useShellShortcuts({ onNewChat, onOpenSessionSearch }: Args) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const commandShiftO =
        (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
      if (commandShiftO && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onNewChat();
        return;
      }
      const plainCommandK =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
      if (!plainCommandK) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      onOpenSessionSearch();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewChat, onOpenSessionSearch]);
}
