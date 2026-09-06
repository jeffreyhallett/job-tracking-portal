import { useEffect, useState, type ReactNode } from "react";
import { STATUS_LABELS, type Status } from "../../shared/types";
import { STATUS_COLOR } from "../lib/status";
import { copyText } from "../lib/clipboard";
import { Icon, type IconName } from "./Icon";

export function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`}
      style={{ backgroundColor: STATUS_COLOR[status] }}
      title={STATUS_LABELS[status]}
    />
  );
}

export function AttentionDot({ title }: { title: string }) {
  return <span aria-label={title} title={title} className="inline-block w-2 h-2 rounded-full bg-warn shrink-0" />;
}

export function CopyButton({ text, label = "Copy", icon, className = "" }: { text: string | (() => string); label?: string; icon?: IconName; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = window.setTimeout(() => setState("idle"), 1500);
    return () => window.clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className={`btn ${className}`}
      onClick={async () => setState((await copyText(typeof text === "function" ? text() : text)) ? "ok" : "fail")}
    >
      {state === "ok" ? <Icon name="check" size={15} strokeWidth={2.2} /> : icon ? <Icon name={icon} size={15} /> : null}
      {state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : label}
    </button>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/25 p-0 sm:p-4"
      style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={`glass glass-strong rounded-t-lg sm:rounded-lg w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92dvh] flex flex-col overflow-hidden animate-[modal-in_220ms_cubic-bezier(0.2,0.8,0.2,1)]`}
        style={{ boxShadow: "var(--shadow-4)" }}
      >
        <div className="flex items-center justify-between h-14 px-5 border-b border-line shrink-0">
          <h2 className="font-bold text-[17px] tracking-[-0.025em]">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon w-8 h-8 text-muted" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

export function Cross() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Caret({ dir }: { dir: "asc" | "desc" | null }) {
  if (!dir) return null;
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="inline ml-1 align-middle">
      {dir === "asc" ? <path d="M1 6l3-4 3 4z" fill="currentColor" /> : <path d="M1 2l3 4 3-4z" fill="currentColor" />}
    </svg>
  );
}
