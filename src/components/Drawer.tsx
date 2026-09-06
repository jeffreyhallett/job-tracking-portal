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
  type Contact,
  type Status,
  type WorkModel,
} from "../../shared/types";
import { describeReason, isSnoozed, rawAttentionReasons } from "../../shared/attention";
import { formatDate, formatRelativeDays } from "../../shared/dates";
import { STATUS_COLOR } from "../lib/status";
import type { Store } from "../state/store";
import { CompanyMark } from "./CompanyMark";
import { Cross } from "./ui";

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
  return (
    <aside
      className="fixed inset-0 sm:inset-auto sm:top-3 sm:right-3 sm:bottom-3 sm:w-[460px] z-30 bg-bg sm:rounded-lg sm:[box-shadow:var(--shadow-pop)] flex flex-col overflow-hidden"
      aria-label={app ? `${app.company} details` : "New application"}
    >
      {app ? <EditForm key={app.id} app={app} store={store} now={now} onClose={onClose} /> : <CreateForm store={store} onClose={onClose} />}
    </aside>
  );
}

function Shell({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 h-14 px-4 border-b border-line shrink-0 bg-panel">
        <div className="font-semibold text-[14px] tracking-[-0.01em] truncate flex-1 min-w-0">{title}</div>
        <button type="button" className="btn btn-ghost h-7 w-7 px-0 rounded-full text-muted" onClick={onClose} aria-label="Close">
          <Cross />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">{children}</div>
      {footer && <div className="border-t border-line bg-panel px-4 py-3 flex items-center gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
    </>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-3">
      <div className="flex items-center justify-between">
        <div className="section-title">{title}</div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ edit

function EditForm({ app, store, now, onClose }: { app: Application; store: Store; now: Date; onClose: () => void }) {
  const reasons = rawAttentionReasons(app, now);
  const snoozed = isSnoozed(app, now);
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
  const commitContacts = (contacts: Contact[]) => {
    if (JSON.stringify(contacts) === JSON.stringify(app.contacts ?? [])) return;
    store.update(app.id, { contacts });
  };

  return (
    <Shell
      title={
        <span className="flex items-center gap-2.5 min-w-0">
          <CompanyMark company={app.company} url={app.url} size={30} />
          <span className="min-w-0">
            <span className="block truncate">{app.company}</span>
            <span className="block text-fg-2 font-normal text-[12px] truncate">{app.role}</span>
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              store.remove(app.id);
              onClose();
            }}
          >
            Delete
          </button>
          <span className="text-[11px] text-muted ml-auto">Changes save on blur</span>
        </>
      }
    >
      {error && <div className="text-[12px] text-danger bg-danger/10 rounded-sm px-3 py-2">{error}</div>}

      <Section title="Progress">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <label className="col-span-2">
            <span className="label">Status</span>
            <div className="flex items-center gap-2">
              <select
                className="pill flex-1 h-8 text-[13px]"
                style={{ ["--sc" as string]: STATUS_COLOR[app.status] }}
                value={app.status}
                onChange={(e) => store.setStatus(app.id, e.target.value as Status)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <Text label="Next action" value={app.nextAction} onCommit={(v) => commitText("nextAction", v)} placeholder="Follow up with recruiter" />
          <Text label="Next action date" value={app.nextActionDate} onCommit={(v) => commitText("nextActionDate", v)} type="date" />
          <Text label="Applied on" value={app.appliedDate} onCommit={(v) => commitText("appliedDate", v)} type="date" />
          <Text label="Deadline" value={app.deadline} onCommit={(v) => commitText("deadline", v)} type="date" />
        </div>
        {(reasons.length > 0 || snoozed) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap text-[12px]">
            {snoozed ? (
              <>
                <span className="text-muted">Snoozed until {formatDate(app.snoozedUntil)}</span>
                {reasons.length > 0 && <span className="text-muted">({reasons.map(describeReason).join(", ")})</span>}
                <button type="button" className="btn btn-soft btn-sm" onClick={() => store.snooze(app.id, 0)}>
                  Unsnooze
                </button>
              </>
            ) : (
              <>
                <span className="text-warn font-medium">{reasons.map(describeReason).join(" · ")}</span>
                <span className="text-muted ml-auto">Snooze</span>
                {[
                  [3, "3d"],
                  [7, "1w"],
                  [14, "2w"],
                ].map(([days, label]) => (
                  <button key={label} type="button" className="btn btn-soft btn-sm" onClick={() => store.snooze(app.id, Number(days))}>
                    {label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Posting">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
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
          <Text
            label="URL"
            value={app.url}
            onCommit={(v) => commitText("url", v)}
            className="col-span-2"
            type="url"
            trailing={
              app.url ? (
                <a href={app.url} target="_blank" rel="noreferrer" className="text-accent text-[12px] font-normal">
                  Open posting
                </a>
              ) : undefined
            }
          />
          <Text label="Source" value={app.source} onCommit={(v) => commitText("source", v)} placeholder="LinkedIn, referral, Simplify" />
          <Text label="Compensation" value={app.compensation} onCommit={(v) => commitText("compensation", v)} />
          <Text label="Tags" value={(app.tags ?? []).join(", ")} onCommit={commitTags} placeholder="comma separated" className="col-span-2" />
        </div>
      </Section>

      <Section title="Contacts" aside={<span className="text-[11px] text-muted">{(app.contacts ?? []).length || ""}</span>}>
        <ContactsEditor contacts={app.contacts ?? []} onCommit={commitContacts} />
      </Section>

      <Section title="Notes">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <Text label="Referral" value={app.referral} onCommit={(v) => commitText("referral", v)} />
          <Text label="Resume version" value={app.resumeVersion} onCommit={(v) => commitText("resumeVersion", v)} placeholder="v3-backend" />
          <Text label="Notes" value={app.notes} onCommit={(v) => commitText("notes", v)} className="col-span-2" multiline />
        </div>
      </Section>

      <Section title="Timeline">
        <Timeline app={app} onAdd={(e) => store.addEvent(app.id, e)} />
      </Section>
    </Shell>
  );
}

// ------------------------------------------------------------ contacts

function ContactsEditor({ contacts, onCommit }: { contacts: Contact[]; onCommit: (c: Contact[]) => void }) {
  const [draft, setDraft] = useState<Contact[]>(contacts);
  useEffect(() => setDraft(contacts), [contacts]);

  const set = (i: number, patch: Partial<Contact>) => setDraft((d) => d.map((c, j) => (j === i ? clean({ ...c, ...patch }) : c)));
  const commit = () => onCommit(draft.filter((c) => c.name.trim() !== "").map(clean));
  const remove = (i: number) => {
    const next = draft.filter((_, j) => j !== i);
    setDraft(next);
    onCommit(next.filter((c) => c.name.trim() !== ""));
  };
  const touch = (i: number) => {
    const next = draft.map((c, j) => (j === i ? { ...c, lastContact: todayISO() } : c));
    setDraft(next);
    onCommit(next.filter((c) => c.name.trim() !== ""));
  };

  return (
    <div className="flex flex-col gap-2">
      {draft.map((c, i) => (
        <div key={i} className="rounded-sm bg-hover p-2 grid grid-cols-2 gap-2">
          <input className="input" placeholder="Name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} onBlur={commit} aria-label="Contact name" />
          <input className="input" placeholder="Role (recruiter, referral…)" value={c.role ?? ""} onChange={(e) => set(i, { role: e.target.value })} onBlur={commit} aria-label="Contact role" />
          <input className="input" placeholder="Email" type="email" value={c.email ?? ""} onChange={(e) => set(i, { email: e.target.value })} onBlur={commit} aria-label="Contact email" />
          <div className="flex items-center gap-1.5">
            <input className="input" type="date" value={c.lastContact ?? ""} onChange={(e) => set(i, { lastContact: e.target.value })} onBlur={commit} aria-label="Last contact" title="Last contact" />
            <button type="button" className="btn btn-sm shrink-0" onClick={() => touch(i)} title="Mark contacted today">
              Today
            </button>
          </div>
          <div className="col-span-2 flex items-center justify-between text-[11px] text-muted">
            <span>{c.lastContact ? `Last contact ${formatRelativeDays(c.lastContact)}` : "No contact logged"}</span>
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => remove(i)}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setDraft((d) => [...d, { name: "" }])}>
          Add contact
        </button>
      </div>
    </div>
  );
}

function clean(c: Contact): Contact {
  const out: Contact = { name: c.name };
  if (c.email?.trim()) out.email = c.email.trim();
  if (c.role?.trim()) out.role = c.role.trim();
  if (c.lastContact) out.lastContact = c.lastContact;
  return out;
}

// ------------------------------------------------------------ timeline

function Timeline({ app, onAdd }: { app: Application; onAdd: (e: { date: string; label: string; details?: string }) => void }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(todayISO());
  const [details, setDetails] = useState("");
  const events = [...app.events].map((e, i) => ({ ...e, i })).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i);

  const save = () => {
    if (!label.trim()) return;
    const e: { date: string; label: string; details?: string } = { date: date || todayISO(), label: label.trim() };
    if (details.trim()) e.details = details.trim();
    onAdd(e);
    setLabel("");
    setDetails("");
    setDate(todayISO());
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {adding ? (
        <div className="rounded-sm bg-hover p-2 flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="input" placeholder="Phone screen with Sam: system design, 45 min" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus aria-label="Entry" />
            <input className="input w-[140px]" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </div>
          <textarea className="input" rows={4} placeholder="Questions asked, what to review, who you met…" value={details} onChange={(e) => setDetails(e.target.value)} aria-label="Details" />
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={!label.trim()} onClick={save}>
              Add entry
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setAdding(true)}>
            Add entry
          </button>
        </div>
      )}
      <ol className="flex flex-col">
        {events.map((e) => (
          <li key={`${e.date}-${e.i}`} className="grid grid-cols-[56px_1fr] gap-2 py-1.5 border-b border-line last:border-0 text-[12px]">
            <span className="text-muted tabular-nums">{formatDate(e.date)}</span>
            <div className="min-w-0">
              <div className="text-fg">{e.label}</div>
              {e.details && <div className="text-fg-2 whitespace-pre-wrap mt-0.5">{e.details}</div>}
            </div>
          </li>
        ))}
        <li className="grid grid-cols-[56px_1fr] gap-2 py-1.5 text-[12px] text-muted">
          <span className="tabular-nums">{formatDate(app.createdAt.slice(0, 10))}</span>
          <span>Created</span>
        </li>
      </ol>
    </div>
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
        className="card p-3 grid grid-cols-2 gap-x-3 gap-y-3"
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
