import { lazy, Suspense } from "react";
import { PairingCodePopup } from "@/components/PairingCodePopup";
import type { PendingDelete, PendingRename } from "@/lib/dialogs";
import type { PairingRequestInfo } from "@/lib/types";

const DeleteConfirm = lazy(() =>
  import("@/components/DeleteConfirm").then((m) => ({ default: m.DeleteConfirm })),
);
const RenameChatDialog = lazy(() =>
  import("@/components/RenameChatDialog").then((m) => ({ default: m.RenameChatDialog })),
);

type Args = {
  pendingDelete: PendingDelete | null;
  pendingRename: PendingRename | null;
  pendingProjectRename: PendingRename | null;
  cancelDelete: () => void;
  cancelRename: () => void;
  cancelProjectRename: () => void;
  onConfirmDelete: () => Promise<void>;
  onConfirmRename: (title: string) => void;
  onConfirmProjectRename: (title: string) => void;
  projectRenameTitle: string;
  projectRenameDescription: string;
  projectRenamePlaceholder: string;
  restartToast: string | null;
  visiblePairingRequests: PairingRequestInfo[];
  pairingBusyCode: string | null;
  pairingError: string | null;
  onPairingApprove: (code: string) => void;
  onDismissPairingRequest: (code: string) => void;
};

export function Overlays({
  pendingDelete,
  pendingRename,
  pendingProjectRename,
  cancelDelete,
  cancelRename,
  cancelProjectRename,
  onConfirmDelete,
  onConfirmRename,
  onConfirmProjectRename,
  projectRenameTitle,
  projectRenameDescription,
  projectRenamePlaceholder,
  restartToast,
  visiblePairingRequests,
  pairingBusyCode,
  pairingError,
  onPairingApprove,
  onDismissPairingRequest,
}: Args) {
  return (
    <>
      {pendingDelete ? (
        <Suspense fallback={null}>
          <DeleteConfirm
            open
            title={pendingDelete.label}
            automations={pendingDelete.automations}
            onCancel={cancelDelete}
            onConfirm={onConfirmDelete}
          />
        </Suspense>
      ) : null}
      {pendingRename ? (
        <Suspense fallback={null}>
          <RenameChatDialog
            open
            title={pendingRename.label}
            onCancel={cancelRename}
            onConfirm={onConfirmRename}
          />
        </Suspense>
      ) : null}
      {pendingProjectRename ? (
        <Suspense fallback={null}>
          <RenameChatDialog
            open
            title={pendingProjectRename.label}
            dialogTitle={projectRenameTitle}
            description={projectRenameDescription}
            placeholder={projectRenamePlaceholder}
            onCancel={cancelProjectRename}
            onConfirm={onConfirmProjectRename}
          />
        </Suspense>
      ) : null}
      {restartToast ? (
        <div
          role="status"
          className="fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-full border border-border/70 bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg"
        >
          {restartToast}
        </div>
      ) : null}
      <PairingCodePopup
        requests={visiblePairingRequests}
        total={visiblePairingRequests.length}
        busyCode={pairingBusyCode}
        error={pairingError}
        onApprove={onPairingApprove}
        onDismiss={onDismissPairingRequest}
      />
    </>
  );
}
