import { useMemo, useState } from "react";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "../../shared/password";
import {
  defaultColumnPrefs,
  defaultLanePrefs,
  MAX_LANE_LABEL,
  type ColumnPref,
  type LanePref,
  type UserPrefs,
} from "../../shared/prefs";
import { STATUS_LABELS, type Application, type Status } from "../../shared/types";
import { api } from "../api";
import { useSession } from "../lib/session";
import { STATUS_COLOR } from "../lib/status";
import { Icon } from "./Icon";
import { CopyButton, Modal } from "./ui";

type Tab = "pipeline" | "columns" | "account" | "automations";

const TABS: { key: Tab; label: string; icon: "columns" | "settings" | "user" | "robot" }[] = [
  { key: "pipeline", label: "Pipeline", icon: "columns" },
  { key: "columns", label: "Table", icon: "settings" },
  { key: "account", label: "Account", icon: "user" },
  { key: "automations", label: "Automations", icon: "robot" },
];

export function Settings({ apps, onClose }: { apps: Application[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("pipeline");
  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="seg self-start flex-wrap" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className="seg-item" onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>
        {tab === "pipeline" && <PipelineTab apps={apps} />}
        {tab === "columns" && <ColumnsTab />}
        {tab === "account" && <AccountTab />}
        {tab === "automations" && <AutomationsTab />}
      </div>
    </Modal>
  );
}

/** Wraps a savePrefs call so every editor reports failures the same way. */
function usePrefsWriter() {
  const { savePrefs } = useSession();
  const [error, setError] = useState<string | null>(null);
  const write = (prefs: UserPrefs) => {
    setError(null);
    savePrefs(prefs).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not save"));
  };
  return { write, error };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="badge badge-danger h-auto py-1.5 px-3 whitespace-normal self-start">{error}</div>;
}

// ---------------------------------------------------------------------------
// Pipeline lanes: rename, reorder, hide
// ---------------------------------------------------------------------------

function PipelineTab({ apps }: { apps: Application[] }) {
  const { lanes, user } = useSession();
  const { write, error } = usePrefsWriter();

  const counts = useMemo(() => {
    const map = new Map<Status, number>();
    for (const a of apps) map.set(a.status, (map.get(a.status) ?? 0) + 1);
    return map;
  }, [apps]);

  /** Current lane order as prefs, so each edit can be expressed as a rewrite. */
  const current = (): LanePref[] =>
    lanes.map((lane) => ({
      status: lane.status,
      ...(lane.renamed ? { label: lane.label } : {}),
      ...(lane.hidden ? { hidden: true } : {}),
    }));

  const commit = (next: LanePref[]) => write({ ...user.prefs, lanes: next });

  /** Blank, or the built-in name, means "no override" rather than an empty lane title. */
  const rename = (status: Status, label: string) => {
    const trimmed = label.trim().slice(0, MAX_LANE_LABEL);
    const custom = trimmed && trimmed !== STATUS_LABELS[status] ? trimmed : undefined;
    commit(current().map((lane) => (lane.status !== status ? lane : { status, ...(custom ? { label: custom } : {}), ...(lane.hidden ? { hidden: true } : {}) })));
  };

  const toggleHidden = (status: Status) =>
    commit(current().map((lane) => (lane.status !== status ? lane : { ...lane, hidden: !lane.hidden })));

  const move = (index: number, delta: number) => {
    const next = current();
    const to = index + delta;
    const item = next[index];
    const other = next[to];
    if (!item || !other) return;
    next[index] = other;
    next[to] = item;
    commit(next);
  };

  const hiddenWithRows = lanes.filter((l) => l.hidden && (counts.get(l.status) ?? 0) > 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-2">
        Rename the lanes to match how you actually talk about your search, move them into the order you work in, and hide the ones you never use. These are yours alone —
        nobody else&apos;s board changes.
      </p>
      <ErrorLine error={error} />

      <ul className="flex flex-col gap-1.5">
        {lanes.map((lane, i) => {
          const count = counts.get(lane.status) ?? 0;
          return (
            <li key={lane.status} className={`tile flex items-center gap-2 p-2 ${lane.hidden ? "opacity-60" : ""}`}>
              <span className="flex flex-col shrink-0">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon w-6 h-5 text-muted"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${lane.label} earlier`}
                >
                  <Icon name="arrowUp" size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon w-6 h-5 text-muted"
                  onClick={() => move(i, 1)}
                  disabled={i === lanes.length - 1}
                  aria-label={`Move ${lane.label} later`}
                >
                  <Icon name="arrowDown" size={13} strokeWidth={2} />
                </button>
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full ring-4 shrink-0"
                style={{ backgroundColor: STATUS_COLOR[lane.status], ["--tw-ring-color" as string]: `color-mix(in srgb, ${STATUS_COLOR[lane.status]} 22%, transparent)` }}
                aria-hidden
              />
              <LaneNameInput lane={lane} onCommit={(value) => rename(lane.status, value)} />
              <span className="badge badge-muted tabular-nums shrink-0" title={`${count} application${count === 1 ? "" : "s"} in this lane`}>
                {count}
              </span>
              {lane.renamed && (
                <button type="button" className="btn btn-ghost btn-sm text-muted shrink-0" onClick={() => rename(lane.status, "")} title={`Restore the default name, ${STATUS_LABELS[lane.status]}`}>
                  <Icon name="undo" size={13} />
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-icon w-8 h-8 text-muted shrink-0"
                onClick={() => toggleHidden(lane.status)}
                aria-pressed={lane.hidden}
                title={lane.hidden ? "Show this lane" : "Hide this lane"}
              >
                <Icon name={lane.hidden ? "eyeOff" : "eye"} size={16} />
              </button>
            </li>
          );
        })}
      </ul>

      {hiddenWithRows.length > 0 && (
        <div className="badge badge-warn h-auto py-1.5 px-3 whitespace-normal self-start">
          <Icon name="eyeOff" size={12} />
          {hiddenWithRows.map((l) => `${l.label} (${counts.get(l.status) ?? 0})`).join(", ")} stay off the board. Nothing is deleted, and the table still shows them.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit(defaultLanePrefs())}>
          <Icon name="undo" size={13} />
          Restore default names and order
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Renaming is cosmetic: the timeline, the stats and the agent API keep using the underlying stage ids, so your history stays intact and nothing breaks if you rename a
        lane back.
      </p>
    </div>
  );
}

/** Local draft while typing, committed on blur or Enter (the app's usual idiom). */
function LaneNameInput({ lane, onCommit }: { lane: { label: string; status: Status }; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? lane.label;
  return (
    <input
      className="input h-8 flex-1 min-w-0 text-[13px]"
      value={value}
      maxLength={MAX_LANE_LABEL}
      aria-label={`Name for the ${STATUS_LABELS[lane.status]} lane`}
      placeholder={STATUS_LABELS[lane.status]}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== lane.label) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function ColumnsTab() {
  const { columns, user } = useSession();
  const { write, error } = usePrefsWriter();

  const current = (): ColumnPref[] => columns.map((c) => ({ key: c.key, ...(c.hidden ? { hidden: true } : {}) }));
  const commit = (next: ColumnPref[]) => write({ ...user.prefs, columns: next });

  const move = (index: number, delta: number) => {
    const next = current();
    const to = index + delta;
    const item = next[index];
    const other = next[to];
    if (!item || !other) return;
    next[index] = other;
    next[to] = item;
    commit(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-2">Which columns the table view shows, and in what order. Status and Company always stay.</p>
      <ErrorLine error={error} />
      <ul className="flex flex-col gap-1.5">
        {columns.map((column, i) => (
          <li key={column.key} className={`tile flex items-center gap-2 p-2 ${column.hidden ? "opacity-60" : ""}`}>
            <span className="flex flex-col shrink-0">
              <button type="button" className="btn btn-ghost btn-icon w-6 h-5 text-muted" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${column.label} left`}>
                <Icon name="arrowUp" size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon w-6 h-5 text-muted"
                onClick={() => move(i, 1)}
                disabled={i === columns.length - 1}
                aria-label={`Move ${column.label} right`}
              >
                <Icon name="arrowDown" size={13} strokeWidth={2} />
              </button>
            </span>
            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-[13px]">
              <input
                type="checkbox"
                checked={!column.hidden}
                disabled={column.required}
                onChange={() => commit(current().map((c) => (c.key === column.key ? { ...c, hidden: !column.hidden } : c)))}
              />
              <span className="truncate">{column.label}</span>
            </label>
            {column.required && <span className="badge badge-muted shrink-0">always on</span>}
            {!column.sortable && <span className="badge badge-muted shrink-0">not sortable</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => commit(defaultColumnPrefs())}>
        <Icon name="undo" size={13} />
        Restore default columns
      </button>
      <p className="text-[11px] text-muted">The board view is unaffected; it always follows your pipeline lanes.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function AccountTab() {
  const { user, setUser, signOut } = useSession();
  const [name, setName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed === (user.name ?? "")) return;
    setSaving(true);
    setNameError(null);
    try {
      setUser(await api.updateMe({ name: trimmed || null }));
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Could not save");
      setName(user.name ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label>
          <span className="label">Email</span>
          <input className="input h-9" value={user.email} readOnly disabled />
        </label>
        <label>
          <span className="label">Display name</span>
          <input
            className="input h-9"
            value={name}
            placeholder="Optional"
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <div className="text-[11px] text-muted">{saving ? "Saving…" : "Saves when you click away."}</div>
        <ErrorLine error={nameError} />
      </div>

      <ChangePasswordForm />

      <div className="border-t border-line pt-3 flex items-center justify-between gap-2">
        <span className="text-[12px] text-fg-2">Signed in on this device.</span>
        <button type="button" className="btn btn-tonal" onClick={signOut}>
          <Icon name="signOut" size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const { setUser } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problem = next ? passwordProblem(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = Boolean(current) && Boolean(next) && Boolean(confirm) && !problem && !mismatch;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      setUser(await api.changePassword(next, current));
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="border-t border-line pt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="section-title">
        <Icon name="key" size={14} />
        Change password
      </div>
      <input className="input h-9" type="password" placeholder="Current password" autoComplete="current-password" aria-label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input className="input h-9" type="password" placeholder="New password" autoComplete="new-password" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} />
      <input className="input h-9" type="password" placeholder="Confirm new password" autoComplete="new-password" aria-label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button type="submit" className="btn btn-primary self-start" disabled={!ready || busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
      {(problem ?? (mismatch ? "The two passwords do not match" : null) ?? error) && (
        <div className="badge badge-danger h-auto py-1.5 px-3 whitespace-normal self-start">{problem ?? (mismatch ? "The two passwords do not match" : null) ?? error}</div>
      )}
      {done && <div className="badge badge-ok self-start">Changed. Other devices have been signed out.</div>}
      <div className="text-[11px] text-muted">At least {MIN_PASSWORD_LENGTH} characters. Every other device is signed out; this one stays in.</div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Automations: the per-user agent token
// ---------------------------------------------------------------------------

function AutomationsTab() {
  const { user, setUser } = useSession();
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the token");
    } finally {
      setBusy(false);
    }
  };

  const rotate = () =>
    run(async () => {
      const { user: updated, token } = await api.rotateAgentToken();
      setUser(updated);
      setFresh(token);
    });

  const revoke = () =>
    run(async () => {
      setUser(await api.revokeAgentToken());
      setFresh(null);
    });

  const base = typeof window === "undefined" ? "" : window.location.origin;
  const prompt = agentPrompt(base, fresh ?? "YOUR_AGENT_TOKEN");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-fg-2">
        A token lets a scheduled Claude task read and update <em>your</em> applications only — not anyone else&apos;s on this instance. It cannot change your password or mint
        another token. See <code className="kbd">docs/AGENT.md</code>.
      </p>
      <ErrorLine error={error} />

      {fresh && (
        <div className="tile p-3 flex flex-col gap-2">
          <div className="text-[12px] font-medium">Copy this now — it is not shown again.</div>
          <code className="text-[12px] break-all bg-panel rounded-[8px] p-2 select-all">{fresh}</code>
          <CopyButton text={fresh} label="Copy token" icon="copy" className="btn-tonal self-start" />
        </div>
      )}

      <div className="tile p-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="text-[12px] font-medium">{user.agentToken ? "Active token" : "No token yet"}</div>
          <div className="text-[12px] text-fg-2">
            {user.agentToken ? (
              <>
                <code className="kbd">{user.agentToken.prefix}…</code> created {new Date(user.agentToken.createdAt).toLocaleDateString()}
              </>
            ) : (
              "Generate one to connect a scheduled task."
            )}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void rotate()} disabled={busy}>
          <Icon name="key" size={15} />
          {user.agentToken ? "Regenerate" : "Generate"}
        </button>
        {user.agentToken && (
          <button type="button" className="btn btn-danger" onClick={() => void revoke()} disabled={busy}>
            Revoke
          </button>
        )}
      </div>
      {user.agentToken && <div className="text-[11px] text-muted">Regenerating or revoking breaks any task still using the old token.</div>}

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        <div className="section-title">
          <Icon name="robot" size={14} />
          Scheduled task prompt
        </div>
        <p className="text-[12px] text-fg-2">
          Paste into a Claude scheduled task{fresh ? " — your new token is already filled in" : ", then replace YOUR_AGENT_TOKEN"}.
        </p>
        <pre className="tile p-3 text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{prompt}</pre>
        <CopyButton text={prompt} label="Copy prompt" icon="copy" className="btn-tonal self-start" />
      </div>
    </div>
  );
}

function agentPrompt(base: string, token: string): string {
  return `You maintain my job application tracker. Base URL: ${base}
Auth: send header "Authorization: Bearer ${token}" on every request.

1. GET /api/agent/digest
2. Use the lane names in user.statusLabels when you write to me; I may have renamed them.
3. Write me a short update, plain text, in this order and only if non-empty:
   - Needs attention: one line each, "Company - Role: reason". Suggest the single most useful next step. If the item has contacts, name who to write to and how long since lastContact.
   - Deadlines in the next 14 days.
   - Next actions due or overdue.
   - What moved in the last 7 days (recentActivity).
   - Snoozed: one line, "Company (until date)" each. No suggestions; I muted them on purpose.
   - One line of stats: active, applied, response rate, median days to response.
4. Do not change any data unless I ask. Never delete anything.`;
}
