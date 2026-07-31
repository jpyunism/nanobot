import { useEffect } from "react";

export function useNativeHostClass(enabled: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle("native-host", enabled);
    return () => {
      document.documentElement.classList.remove("native-host");
    };
  }, [enabled]);
}
