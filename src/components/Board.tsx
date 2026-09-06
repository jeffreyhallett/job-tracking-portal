import { useEffect, useRef, useState, type DragEvent } from "react";
import { STATUSES, STATUS_LABELS, type Application, type Status } from "../../shared/types";
import { attentionReasons, describeReason, isSnoozed } from "../../shared/attention";
import { CompanyMark } from "./CompanyMark";
import { formatRelativeDays } from "../../shared/dates";
import { STATUS_COLOR } from "../lib/status";
import { AttentionDot } from "./ui";

type Props = {
  apps: Application[];
  errors: Record<string, string>;
  now: Date;
  focusedId: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
};

const DRAG_MIME = "text/plain";

export function Board({ apps, errors, now, focusedId, onOpen, onMove }: Props) {
  const [over, setOver] = useState<Status | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const byStatus = new Map<Status, Application[]>(STATUSES.map((s) => [s, []]));
  for (const a of apps) byStatus.get(a.status)?.push(a);

  const onDrop = (e: DragEvent, status: Status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME);
    setOver(null);
    setDragging(null);
    if (id) onMove(id, status);
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
      <div className="flex h-full gap-3 px-3 sm:px-4 pb-3 min-w-max">
        {STATUSES.map((status) => {
          const col = byStatus.get(status) ?? [];
          const isOver = over === status;
          return (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              className={`lane flex flex-col w-[240px] h-full transition-[background-color,box-shadow] ${isOver ? "bg-accent/10 ring-2 ring-accent/40" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== status) setOver(status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => onDrop(e, status)}
            >
              <header className="flex items-center gap-2 h-9 px-3 shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                <span className="text-[12px] font-semibold tracking-[-0.01em]">{STATUS_LABELS[status]}</span>
                <span className="text-[11px] text-muted tabular-nums">{col.length}</span>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
                {col.map((a) => (
                  <Card
                    key={a.id}
                    app={a}
                    now={now}
                    error={errors[a.id]}
                    focused={focusedId === a.id}
                    dragging={dragging === a.id}
                    onOpen={() => onOpen(a.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, a.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(a.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {col.length === 0 && <div className="flex-1 min-h-8" />}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type CardProps = {
  app: Application;
  now: Date;
  error?: string;
  focused: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
};

function Card({ app, now, error, focused, dragging, onOpen, onDragStart, onDragEnd }: CardProps) {
  const reasons = attentionReasons(app, now);
  const attention = reasons.map(describeReason).join(", ");
  const snoozed = isSnoozed(app, now);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  return (
    <article
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
      className={`group card px-3 py-2.5 cursor-grab active:cursor-grabbing hover:[box-shadow:var(--shadow-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-[box-shadow,opacity,transform] duration-150 animate-[card-in_160ms_ease-out] ${dragging ? "opacity-40 scale-[0.98]" : ""} ${error ? "ring-1 ring-danger/60" : ""} ${focused ? "ring-2 ring-accent/60" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark company={app.company} url={app.url} size={28} className="mt-px" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate leading-tight tracking-[-0.01em] text-[13.5px]">{app.company}</div>
          <div className="text-fg-2 truncate leading-tight text-[12px] mt-0.5">{app.role}</div>
        </div>
        {reasons.length > 0 && (
          <div className="pt-1">
            <AttentionDot title={attention} />
          </div>
        )}
        {snoozed && <span className="text-[10px] font-medium text-muted pt-0.5" title={`Snoozed until ${app.snoozedUntil ?? ""}`}>zz</span>}
      </div>
      {(app.location || app.nextActionDate || app.deadline || (app.tags && app.tags.length > 0)) && (
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted leading-tight">
          {app.location && <span className="truncate max-w-[140px]">{app.location}</span>}
          {app.nextActionDate && !reasons.some((r) => r.kind === "action_due") && <span>next {formatRelativeDays(app.nextActionDate, now)}</span>}
          {!app.nextActionDate && app.deadline && app.status === "interested" && !reasons.some((r) => r.kind === "deadline_soon") && (
            <span>due {formatRelativeDays(app.deadline, now)}</span>
          )}
          {app.tags?.slice(0, 3).map((t) => (
            <span key={t} className="text-fg-2/80">
              #{t}
            </span>
          ))}
        </div>
      )}
      {reasons.length > 0 && <div className="mt-1.5 text-[11px] text-warn font-medium leading-tight">{attention}</div>}
      {error && <div className="mt-1.5 text-[11px] text-danger leading-tight">{error}</div>}
    </article>
  );
}
