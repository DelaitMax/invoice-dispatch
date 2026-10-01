import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/Button";
import { api } from "@/services/api";
import { dismissToast, type Toast } from "@/features/toasts/toastSlice";

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const timer = setTimeout(() => dispatch(dismissToast(toast.id)), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [dispatch, toast.id, toast.updatedAt]);

  function handleAction() {
    if (toast.action === "refetch") {
      dispatch(api.util.invalidateTags(["Invoice", "CurrentUser"]));
    }
    dispatch(dismissToast(toast.id));
  }

  const tone =
    toast.kind === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-border bg-surface text-ink";

  return (
    <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm shadow-sm ${tone}`} role="alert">
      <span className="flex-1">{toast.message}</span>
      {toast.action === "refetch" && (
        <Button variant="secondary" onClick={handleAction}>
          Повторить
        </Button>
      )}
      <button
        type="button"
        className="text-base leading-none opacity-60 hover:opacity-100"
        aria-label="Закрыть уведомление"
        onClick={() => dispatch(dismissToast(toast.id))}
      >
        ×
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useAppSelector((state) => state.toasts.items);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
