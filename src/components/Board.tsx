import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Application, Status } from "../../shared/types";
import { attentionReasons, describeReason, isSnoozed } from "../../shared/attention";
import { stageCompletedOn } from "../../shared/timeline";
import { CompanyMark } from "./CompanyMark";
import { Icon } from "./Icon";
import { formatRelativeDays } from "../../shared/dates";
import { useStages } from "../lib/session";

type Props = {
  apps: Application[];
  errors: Record<string, string>;
  now: Date;
  focusedId: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  /** Opens Settings, from the note about stages the board is not showing. */
  onEditStages: () => void;
};

const DRAG_MIME = "text/plain";

export function Board({ apps, errors, now, focusedId, onOpen, onMove, onEditStages }: Props) {
  const stages = useStages();
  const [over, setOver] = useState<Status | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const byStatus = new Map<Status, Application[]>(stages.ids.map((id) => [id, []]));
  for (const a of apps) {
    const bucket = byStatus.get(a.status);
    if (bucket) bucket.push(a);
    else byStatus.set(a.status, [a]); // a stage the pipeline no longer has
  }

  // A stage the board is not showing must never swallow rows silently, so
  // anything sitting in one gets a muted column at the end that says so.
  const offBoard = [...byStatus.entries()]
    .filter(([id, rows]) => rows.length > 0 && (stages.isUnknown(id) || stages.get(id).hidden))
    .map(([id, rows]) => ({ id, label: stages.label(id), count: rows.length, unknown: stages.isUnknown(id) }));

  const onDrop = (e: DragEvent, status: Status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME);
    setOver(null);
    setDragging(null);
    if (id) onMove(id, status);
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
      <div className="flex h-full gap-3 px-4 sm:px-6 pb-4 min-w-max">
        {stages.visible.map(({ id: status, label, color }) => {
          const col = byStatus.get(status) ?? [];
          const isOver = over === status;
          return (
            <section
              key={status}
              aria-label={label}
              className={`lane flex flex-col w-[256px] h-full transition-[background-color,box-shadow] ${isOver ? "bg-accent-container/60 ring-2 ring-accent/50" : ""}`}
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
              <header className="flex items-center gap-2 h-11 px-3.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full ring-4" style={{ backgroundColor: color, ["--tw-ring-color" as string]: `color-mix(in srgb, ${color} 22%, transparent)` }} />
                <span className="text-[13px] font-semibold tracking-[-0.01em] truncate">{label}</span>
                <span className="ml-auto badge badge-muted tabular-nums">{col.length}</span>
              </header>
              {/* pt/px leave room for the focus ring on the first card; the scroll container would clip it otherwise. */}
              <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-1 pb-2 flex flex-col gap-2">
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

        {offBoard.length > 0 && (
          <section aria-label="Stages not shown" className="lane flex flex-col w-[210px] h-full">
            <header className="flex items-center gap-2 h-11 px-3.5 shrink-0 text-muted">
              <Icon name="eyeOff" size={14} />
              <span className="text-[13px] font-semibold tracking-[-0.01em]">Not shown</span>
            </header>
            <div className="px-3.5 pb-3 flex flex-col gap-2 text-[12px] text-fg-2">
              {offBoard.map((stage) => (
                <div key={stage.id} className="flex items-center gap-2">
                  <span className="truncate" title={stage.unknown ? "This stage is no longer in your pipeline" : "Hidden"}>
                    {stage.label}
                  </span>
                  <span className="badge badge-muted tabular-nums ml-auto">{stage.count}</span>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm self-start -ml-2" onClick={onEditStages}>
                <Icon name="settings" size={13} />
                Edit pipeline
              </button>
            </div>
          </section>
        )}
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
  const stages = useStages();
  const reasons = attentionReasons(app, stages, now);
  const attention = reasons.map(describeReason).join(", ");
  const snoozed = isSnoozed(app, now);
  const completedOn = stageCompletedOn(app, stages);
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
      className={`group card card-hover p-3 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-[box-shadow,opacity,transform] duration-150 animate-[card-in_160ms_ease-out] ${dragging ? "opacity-40 scale-[0.98]" : ""} ${error ? "ring-2 ring-danger/50" : ""} ${focused ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark company={app.company} url={app.url} size={34} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate leading-[1.2] tracking-[-0.012em] text-[14px]">{app.company}</div>
          <div className="text-fg-2 truncate leading-[1.25] text-[12.5px] mt-0.5">{app.role}</div>
        </div>
      </div>
      {(app.location || app.nextActionDate || app.deadline || (app.tags && app.tags.length > 0)) && (
        <div className="mt-2 flex items-center gap-1 flex-wrap text-[11px] text-muted leading-tight">
          {app.location && (
            <span className="inline-flex items-center gap-0.5 truncate max-w-[150px]">
              <Icon name="pin" size={12} />
              {app.location}
            </span>
          )}
          {app.nextActionDate && !reasons.some((r) => r.kind === "action_due") && (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="flag" size={12} />
              {formatRelativeDays(app.nextActionDate, now)}
            </span>
          )}
          {!app.nextActionDate && app.deadline && stages.isLead(app.status) && !reasons.some((r) => r.kind === "deadline_soon") && (
            <span className="inline-flex items-center gap-0.5">
              <Icon name="calendar" size={12} />
              {formatRelativeDays(app.deadline, now)}
            </span>
          )}
          {app.tags?.slice(0, 3).map((t) => (
            <span key={t} className="badge badge-muted h-5 px-1.5">
              {t}
            </span>
          ))}
        </div>
      )}
      {(reasons.length > 0 || snoozed || completedOn) && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {completedOn && (
            <span className="badge badge-ok" title={`${stages.label(app.status)} completed ${completedOn}`}>
              <Icon name="check" size={12} strokeWidth={2} />
              done
            </span>
          )}
          {reasons.length > 0 && (
            <span className="badge badge-warn">
              <Icon name="clock" size={12} strokeWidth={2} />
              {attention}
            </span>
          )}
          {snoozed && (
            <span className="badge badge-muted" title={`Snoozed until ${app.snoozedUntil ?? ""}`}>
              <Icon name="moon" size={12} />
              snoozed
            </span>
          )}
        </div>
      )}
      {error && <div className="mt-2 badge badge-danger">{error}</div>}
    </article>
  );
}
