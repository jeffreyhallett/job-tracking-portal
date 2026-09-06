import type { Toast as ToastData } from "../state/store";

export function Toast({ toast, onDismiss }: { toast: ToastData | undefined; onDismiss: (id: number) => void }) {
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 pl-4 pr-2 h-10 rounded-full text-[13px] text-fg bg-panel [box-shadow:var(--shadow-pop)] animate-[toast-in_180ms_ease-out]"
      >
        <span className="truncate max-w-[60vw]">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            className="btn btn-sm rounded-full text-accent"
            onClick={() => {
              toast.undo?.();
              onDismiss(toast.id);
            }}
          >
            Undo
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm h-7 w-7 px-0 rounded-full text-muted" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
          ×
        </button>
      </div>
    </div>
  );
}
