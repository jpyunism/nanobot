import { useEffect } from "react";

type Args = {
  onNewChat: () => void;
  onOpenSessionSearch: () => void;
  onOpenAgenda?: () => void;
};

export function useShellShortcuts({ onNewChat, onOpenSessionSearch, onOpenAgenda }: Args) {
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const commandShift =
        (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
      if (commandShift && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onNewChat();
        return;
      }
      if (commandShift && event.key.toLowerCase() === "a" && onOpenAgenda) {
        event.preventDefault();
        onOpenAgenda();
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
  }, [onNewChat, onOpenSessionSearch, onOpenAgenda]);
}
