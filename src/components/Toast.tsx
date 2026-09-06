import type { Toast as ToastData } from "../state/store";
import { Icon } from "./Icon";

/** Glass capsule, iOS notification style. Sits above the phone dock. */
export function Toast({ toast, onDismiss }: { toast: ToastData | undefined; onDismiss: (id: number) => void }) {
  if (!toast) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] md:bottom-6 z-50 pointer-events-none max-w-[calc(100vw-2rem)]">
      <div role="status" className="glass glass-strong pointer-events-auto flex items-center gap-2 pl-4 pr-1.5 h-12 rounded-full text-[13px] font-medium animate-[toast-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]">
        <span className="truncate max-w-[60vw] relative">{toast.message}</span>
        {toast.undo && (
          <button
            type="button"
            className="relative inline-flex items-center gap-1 h-8 px-3 rounded-full text-[13px] font-semibold text-accent hover:bg-hover"
            onClick={() => {
              toast.undo?.();
              onDismiss(toast.id);
            }}
          >
            <Icon name="undo" size={14} strokeWidth={2.2} />
            Undo
          </button>
        )}
        <button type="button" className="relative inline-flex items-center justify-center w-8 h-8 rounded-full text-muted hover:text-fg hover:bg-hover" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
          <Icon name="close" size={14} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
