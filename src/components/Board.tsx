import { useState, type DragEvent } from "react";
import { STATUSES, STATUS_LABELS, type Application, type Status } from "../../shared/types";
import { attentionReasons, describeReason } from "../lib/attention";
import { formatRelativeDays } from "../lib/dates";
import { STATUS_COLOR } from "../lib/status";
import { AttentionDot } from "./ui";

type Props = {
  apps: Application[];
  errors: Record<string, string>;
  now: Date;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
};

const DRAG_MIME = "text/plain";

export function Board({ apps, errors, now, onOpen, onMove }: Props) {
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
      <div className="flex h-full gap-2 p-2 min-w-max">
        {STATUSES.map((status) => {
          const col = byStatus.get(status) ?? [];
          const isOver = over === status;
          return (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              className={`flex flex-col w-[220px] rounded border ${isOver ? "border-accent bg-accent/5" : "border-line bg-bg"} h-full`}
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
              <header className="flex items-center gap-1.5 h-7 px-2 shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                <span className="text-[12px] font-medium">{STATUS_LABELS[status]}</span>
                <span className="text-[11px] text-muted tabular-nums">{col.length}</span>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-1.5 flex flex-col gap-1">
                {col.map((a) => (
                  <Card
                    key={a.id}
                    app={a}
                    now={now}
                    error={errors[a.id]}
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
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
};

function Card({ app, now, error, dragging, onOpen, onDragStart, onDragEnd }: CardProps) {
  const reasons = attentionReasons(app, now);
  const attention = reasons.map(describeReason).join(", ");
  return (
    <article
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
      className={`group rounded border border-line bg-panel px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${dragging ? "opacity-40" : ""} ${error ? "border-danger/60" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate leading-tight">{app.company}</div>
          <div className="text-fg-2 truncate leading-tight text-[12px]">{app.role}</div>
        </div>
        {reasons.length > 0 && (
          <div className="pt-1">
            <AttentionDot title={attention} />
          </div>
        )}
      </div>
      {(app.location || app.nextActionDate || app.deadline || (app.tags && app.tags.length > 0)) && (
        <div className="mt-1 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] text-muted leading-tight">
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
      {reasons.length > 0 && <div className="mt-1 text-[11px] text-warn leading-tight">{attention}</div>}
      {error && <div className="mt-1 text-[11px] text-danger leading-tight">{error}</div>}
    </article>
  );
}
