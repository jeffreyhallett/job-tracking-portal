import { useEffect, useState, type ReactNode } from "react";
import {
  STATUSES,
  STATUS_LABELS,
  WORK_MODELS,
  statusEventLabel,
  todayISO,
  type Application,
  type ApplicationInput,
  type ApplicationPatch,
  type Status,
  type WorkModel,
} from "../../shared/types";
import { attentionReasons, describeReason } from "../lib/attention";
import { formatDate } from "../lib/dates";
import type { Store } from "../state/store";
import { Cross, StatusDot } from "./ui";

type Props = {
  /** null = create mode */
  app: Application | null;
  store: Store;
  now: Date;
  onClose: () => void;
};

type TextKey =
  | "company"
  | "role"
  | "location"
  | "url"
  | "source"
  | "appliedDate"
  | "deadline"
  | "compensation"
  | "referral"
  | "resumeVersion"
  | "notes"
  | "nextAction"
  | "nextActionDate";

export function Drawer({ app, store, now, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] z-30 bg-panel sm:border-l border-line shadow-xl flex flex-col"
      aria-label={app ? `${app.company} details` : "New application"}
    >
      {app ? <EditForm key={app.id} app={app} store={store} now={now} onClose={onClose} /> : <CreateForm store={store} onClose={onClose} />}
    </aside>
  );
}

function Shell({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 h-10 px-3 border-b border-line shrink-0">
        <div className="font-medium text-sm truncate flex-1 min-w-0">{title}</div>
        <button type="button" className="btn btn-ghost h-6 px-1.5 text-muted" onClick={onClose} aria-label="Close">
          <Cross />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">{children}</div>
      {footer && <div className="border-t border-line p-2 flex items-center gap-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </>
  );
}

// ------------------------------------------------------------------ edit

function EditForm({ app, store, now, onClose }: { app: Application; store: Store; now: Date; onClose: () => void }) {
  const reasons = attentionReasons(app, now);
  const error = store.state.errors[app.id];

  const commitText = (key: TextKey, raw: string) => {
    const value = raw.trim();
    const current = app[key] ?? "";
    if (value === current) return;
    if ((key === "company" || key === "role") && value === "") return;
    const patch: ApplicationPatch = {};
    if (key === "company" || key === "role") patch[key] = value;
    else patch[key] = value === "" ? null : value;
    store.update(app.id, patch);
  };
  const commitTags = (raw: string) => {
    const tags = parseTags(raw);
    if (tags.join(",") === (app.tags ?? []).join(",")) return;
    store.update(app.id, { tags });
  };
  const commitWorkModel = (raw: string) => {
    const value = raw === "" ? null : (raw as WorkModel);
    if ((value ?? undefined) === app.workModel) return;
    store.update(app.id, { workModel: value });
  };

  const events = [...app.events].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Shell
      title={
        <span className="flex items-center gap-2 min-w-0">
          <StatusDot status={app.status} />
          <span className="truncate">{app.company}</span>
          <span className="text-fg-2 font-normal truncate">{app.role}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm(`Delete ${app.company} — ${app.role}?`)) {
                store.remove(app.id);
                onClose();
              }
            }}
          >
            Delete
          </button>
          <span className="text-[11px] text-muted ml-auto">Changes save on blur</span>
        </>
      }
    >
      {error && <div className="text-[12px] text-danger border border-danger/40 rounded px-2 py-1">{error}</div>}
      {reasons.length > 0 && <div className="text-[12px] text-warn">{reasons.map(describeReason).join(" · ")}</div>}

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2">
          <span className="label">Status</span>
          <select className="input" value={app.status} onChange={(e) => store.setStatus(app.id, e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <Text label="Company" value={app.company} onCommit={(v) => commitText("company", v)} required />
        <Text label="Role" value={app.role} onCommit={(v) => commitText("role", v)} required />
        <Text label="Location" value={app.location} onCommit={(v) => commitText("location", v)} placeholder="New York, NY" />
        <label>
          <span className="label">Work model</span>
          <select className="input" value={app.workModel ?? ""} onChange={(e) => commitWorkModel(e.target.value)}>
            <option value="">—</option>
            {WORK_MODELS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <Text label="URL" value={app.url} onCommit={(v) => commitText("url", v)} className="col-span-2" type="url" trailing={app.url ? <a href={app.url} target="_blank" rel="noreferrer" className="text-accent text-[12px] normal-case tracking-normal">open</a> : undefined} />
        <Text label="Source" value={app.source} onCommit={(v) => commitText("source", v)} placeholder="LinkedIn, referral, Simplify" />
        <Text label="Tags" value={(app.tags ?? []).join(", ")} onCommit={commitTags} placeholder="comma separated" />
        <Text label="Applied" value={app.appliedDate} onCommit={(v) => commitText("appliedDate", v)} type="date" />
        <Text label="Deadline" value={app.deadline} onCommit={(v) => commitText("deadline", v)} type="date" />
        <Text label="Next action" value={app.nextAction} onCommit={(v) => commitText("nextAction", v)} placeholder="Follow up with recruiter" />
        <Text label="Next action date" value={app.nextActionDate} onCommit={(v) => commitText("nextActionDate", v)} type="date" />
        <Text label="Compensation" value={app.compensation} onCommit={(v) => commitText("compensation", v)} />
        <Text label="Referral" value={app.referral} onCommit={(v) => commitText("referral", v)} />
        <Text label="Resume version" value={app.resumeVersion} onCommit={(v) => commitText("resumeVersion", v)} placeholder="v3-backend" />
        <Text label="Notes" value={app.notes} onCommit={(v) => commitText("notes", v)} className="col-span-2" multiline />
      </div>

      <section>
        <div className="label">Timeline</div>
        <ol className="flex flex-col gap-0.5 text-[12px]">
          {events.map((e, i) => (
            <li key={`${e.date}-${i}`} className="flex gap-2">
              <span className="text-muted tabular-nums w-14 shrink-0">{formatDate(e.date)}</span>
              <span className="text-fg-2">{e.label}</span>
            </li>
          ))}
          <li className="flex gap-2 text-muted">
            <span className="tabular-nums w-14 shrink-0">{formatDate(app.createdAt.slice(0, 10))}</span>
            <span>Created</span>
          </li>
        </ol>
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------- create

function CreateForm({ store, onClose }: { store: Store; onClose: () => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>("interested");
  const [deadline, setDeadline] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = company.trim() !== "" && role.trim() !== "" && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const today = todayISO();
    const input: ApplicationInput = {
      company: company.trim(),
      role: role.trim(),
      status,
      tags: parseTags(tags),
      events: [{ date: today, label: statusEventLabel(status) }],
    };
    if (location.trim()) input.location = location.trim();
    if (url.trim()) input.url = url.trim();
    if (source.trim()) input.source = source.trim();
    if (deadline) input.deadline = deadline;
    if (notes.trim()) input.notes = notes.trim();
    if (status === "applied") input.appliedDate = today;
    try {
      await store.create(input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <Shell
      title="New application"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={submit}>
            {saving ? "Saving…" : "Create"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {error && <span className="text-[12px] text-danger ml-auto">{error}</span>}
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="col-span-2">
          <span className="label">Company</span>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus required />
        </label>
        <label className="col-span-2">
          <span className="label">Role</span>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} required />
        </label>
        <label>
          <span className="label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Location</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote" />
        </label>
        <label className="col-span-2">
          <span className="label">URL</span>
          <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <label>
          <span className="label">Source</span>
          <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="LinkedIn" />
        </label>
        <label>
          <span className="label">Deadline</span>
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="col-span-2">
          <span className="label">Tags</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma separated" />
        </label>
        <label className="col-span-2">
          <span className="label">Notes</span>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------- helpers

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;]/)
        .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean),
    ),
  );
}

type TextProps = {
  label: string;
  value: string | undefined;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: "text" | "url" | "date";
  className?: string;
  multiline?: boolean;
  required?: boolean;
  trailing?: ReactNode;
};

/** Uncontrolled-ish text field: local state while typing, commit on blur/Enter. */
function Text({ label, value, onCommit, placeholder, type = "text", className = "", multiline = false, required = false, trailing }: TextProps) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = () => {
    if (required && draft.trim() === "") {
      setDraft(value ?? "");
      return;
    }
    onCommit(draft);
  };

  return (
    <label className={className}>
      <span className="label flex items-center justify-between">
        {label}
        {trailing}
      </span>
      {multiline ? (
        <textarea className="input" rows={4} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      ) : (
        <input
          className="input"
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      )}
    </label>
  );
}
