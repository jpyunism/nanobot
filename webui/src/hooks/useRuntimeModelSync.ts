import { useEffect } from "react";
import type { NanobotClient } from "@/lib/nanobot-client";

type Args = {
  client: NanobotClient;
  onModelNameChange: (modelName: string | null) => void;
};

export function useRuntimeModelSync({ client, onModelNameChange }: Args) {
  useEffect(() => {
    return client.onRuntimeModelUpdate((modelName) => {
      onModelNameChange(modelName);
    });
  }, [client, onModelNameChange]);
}
