import type { Toast as ToastData } from "../state/store";
import { Icon } from "./Icon";

/** Material-style snackbar on the inverse surface. */
export function Toast({ toast, onDismiss }: { toast: ToastData | undefined; onDismiss: (id: number) => void }) {
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-50 pointer-events-none">
      <div role="status" className="pointer-events-auto flex items-center gap-2 pl-4 pr-1.5 h-12 rounded-[14px] text-[13px] bg-inverse text-inverse-fg animate-[toast-in_180ms_ease-out]" style={{ boxShadow: "var(--shadow-3)" }}>
        <span className="truncate max-w-[60vw]">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[13px] font-semibold text-accent hover:bg-white/10"
            style={{ color: "var(--c-accent-strong)" }}
            onClick={() => {
              toast.undo?.();
              onDismiss(toast.id);
            }}
          >
            <Icon name="undo" size={14} strokeWidth={2.2} />
            Undo
          </button>
        )}
        <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-full opacity-70 hover:opacity-100 hover:bg-white/10" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
          <Icon name="close" size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
