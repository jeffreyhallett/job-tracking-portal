import { useMemo, useState } from "react";
import { passwordProblem } from "../../shared/password";
import { defaultColumnPrefs, type ColumnPref } from "../../shared/prefs";
import {
  MAX_STAGE_LABEL,
  MAX_STAGES,
  PHASE_INFO,
  STAGE_COLORS,
  STAGE_PHASES,
  STAGE_PRESETS,
  stageIdFor,
  stagesProblem,
  suggestColor,
  type Stage,
  type StagePhase,
} from "../../shared/stages";
import type { Application } from "../../shared/types";
import { api } from "../api";
import { useSession, type StageReassignment } from "../lib/session";
import { Icon } from "./Icon";
import { CopyButton, Modal } from "./ui";

type Tab = "pipeline" | "columns" | "account" | "automations";

const TABS: { key: Tab; label: string; icon: "columns" | "settings" | "user" | "robot" }[] = [
  { key: "pipeline", label: "Pipeline", icon: "columns" },
  { key: "columns", label: "Table", icon: "settings" },
  { key: "account", label: "Account", icon: "user" },
  { key: "automations", label: "Automations", icon: "robot" },
];

export function Settings({ apps, onReload, onClose }: { apps: Application[]; onReload: () => void; onClose: () => void }) {
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
        {tab === "pipeline" && <PipelineTab apps={apps} onReload={onReload} />}
        {tab === "columns" && <ColumnsTab />}
        {tab === "account" && <AccountTab />}
        {tab === "automations" && <AutomationsTab />}
      </div>
    </Modal>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="badge badge-danger h-auto py-1.5 px-3 whitespace-normal self-start">{error}</div>;
}

// ---------------------------------------------------------------------------
// Pipeline: add, rename, recolour, reorder, hide, delete, and say what a stage means
// ---------------------------------------------------------------------------

/**
 * Edited as a draft and saved in one go, unlike the rest of Settings. Adding or
 * deleting a stage is structural: removing one has to say where its applications
 * go, and that only makes sense as a single confirmed change.
 */
function PipelineTab({ apps, onReload }: { apps: Application[]; onReload: () => void }) {
  const { stages, user, savePrefs } = useSession();
  const [draft, setDraft] = useState<Stage[] | null>(null);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);

  const current = draft ?? stages.all;
  const dirty = draft !== null;

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of apps) map[a.status] = (map[a.status] ?? 0) + 1;
    return map;
  }, [apps]);

  /**
   * Stages that hold applications but will not exist once this draft is saved:
   * ones being deleted, plus any the pipeline has already lost track of. Each
   * needs somewhere for its applications to go before Save is allowed.
   */
  const stranded = useMemo(() => {
    const keep = new Set(current.map((s) => s.id));
    return Object.keys(counts)
      .filter((id) => !keep.has(id) && (counts[id] ?? 0) > 0)
      .map((id) => ({ id, label: stages.label(id), count: counts[id] ?? 0 }));
  }, [counts, current, stages]);

  const problem = stagesProblem(current);
  const unassigned = stranded.filter((s) => !moves[s.id]);
  const canSave = dirty && !problem && unassigned.length === 0 && !saving;

  const edit = (next: Stage[]) => {
    setDraft(next);
    setError(null);
  };
  const patch = (id: string, change: Partial<Stage>) => edit(current.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const move = (index: number, delta: number) => {
    const next = [...current];
    const to = index + delta;
    const item = next[index];
    const other = next[to];
    if (!item || !other) return;
    next[index] = other;
    next[to] = item;
    edit(next);
  };

  const addStage = (label: string, phase: StagePhase) => {
    const id = stageIdFor(label, current.map((s) => s.id));
    const stage: Stage = { id, label: label.trim().slice(0, MAX_STAGE_LABEL), color: suggestColor(phase, current.map((s) => s.color)), phase };
    // Slot it before the terminal stages, which belong at the end of a pipeline.
    const firstClosed = phase === "closed" ? -1 : current.findIndex((s) => s.phase === "closed");
    edit(firstClosed === -1 ? [...current, stage] : [...current.slice(0, firstClosed), stage, ...current.slice(firstClosed)]);
  };

  const removeStage = (id: string) => {
    edit(current.filter((s) => s.id !== id));
    setPaletteFor(null);
  };

  const reset = () => {
    setDraft(null);
    setMoves({});
    setError(null);
    setPaletteFor(null);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const reassign: StageReassignment[] = stranded.flatMap((s) => {
      const to = moves[s.id];
      return to ? [{ from: s.id, to }] : [];
    });
    try {
      await savePrefs({ ...user.prefs, stages: current }, reassign);
      reset();
      // The server moved rows between stages; the local copies are stale.
      if (reassign.length) onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the pipeline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-2">
        Your pipeline, yours alone — nobody else&apos;s board changes. Add the stages your process actually has, drop the ones it does not, and tell the app what each one means
        so the stale flags and the response rate still make sense.
      </p>
      <ErrorLine error={error ?? problem} />

      <ul className="flex flex-col gap-1.5">
        {current.map((stage, i) => {
          const count = counts[stage.id] ?? 0;
          const info = PHASE_INFO[stage.phase];
          return (
            <li key={stage.id} className={`tile p-2 flex flex-col gap-2 ${stage.hidden ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="flex flex-col shrink-0">
                  <button type="button" className="btn btn-ghost btn-icon w-6 h-5 text-muted" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${stage.label} earlier`}>
                    <Icon name="arrowUp" size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon w-6 h-5 text-muted"
                    onClick={() => move(i, 1)}
                    disabled={i === current.length - 1}
                    aria-label={`Move ${stage.label} later`}
                  >
                    <Icon name="arrowDown" size={13} strokeWidth={2} />
                  </button>
                </span>

                <button
                  type="button"
                  className="w-6 h-6 rounded-full shrink-0 inline-flex items-center justify-center"
                  style={{ boxShadow: `inset 0 0 0 2px ${stage.color}` }}
                  onClick={() => setPaletteFor(paletteFor === stage.id ? null : stage.id)}
                  aria-label={`Colour for ${stage.label}`}
                  aria-expanded={paletteFor === stage.id}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                </button>

                <StageNameInput stage={stage} onCommit={(label) => patch(stage.id, { label })} />

                <span className="badge badge-muted tabular-nums shrink-0" title={`${count} application${count === 1 ? "" : "s"} in this stage`}>
                  {count}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon w-8 h-8 text-muted shrink-0"
                  onClick={() => patch(stage.id, { hidden: !stage.hidden })}
                  aria-pressed={stage.hidden === true}
                  title={stage.hidden ? "Show on the board" : "Hide from the board"}
                >
                  <Icon name={stage.hidden ? "eyeOff" : "eye"} size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon w-8 h-8 text-danger shrink-0"
                  onClick={() => removeStage(stage.id)}
                  disabled={current.length === 1}
                  title={count > 0 ? `Delete — you will be asked where its ${count} application${count === 1 ? "" : "s"} should go` : "Delete this stage"}
                  aria-label={`Delete ${stage.label}`}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>

              {paletteFor === stage.id && (
                <div className="flex items-center gap-1.5 flex-wrap pl-8">
                  {STAGE_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: c.value, boxShadow: stage.color === c.value ? "0 0 0 2px var(--c-fg)" : "none" }}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={stage.color === c.value}
                      onClick={() => {
                        patch(stage.id, { color: c.value });
                        setPaletteFor(null);
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="pl-8 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="input h-8 text-[12px] w-auto"
                    value={stage.phase}
                    aria-label={`What ${stage.label} means`}
                    onChange={(e) => patch(stage.id, { phase: e.target.value as StagePhase, completable: undefined })}
                  >
                    {STAGE_PHASES.map((phase) => (
                      <option key={phase} value={phase}>
                        {PHASE_INFO[phase].title}
                      </option>
                    ))}
                  </select>
                  {stage.phase !== "closed" && stage.phase !== "lead" && (
                    <label className="flex items-center gap-1.5 text-[12px] text-fg-2 cursor-pointer">
                      <input type="checkbox" checked={stage.completable ?? stage.phase === "active"} onChange={(e) => patch(stage.id, { completable: e.target.checked })} />
                      Can be marked complete
                    </label>
                  )}
                </div>
                <div className="text-[11px] text-muted">{info.effects.join(" · ")}</div>
              </div>
            </li>
          );
        })}
      </ul>

      <AddStage onAdd={addStage} disabled={current.length >= MAX_STAGES} />

      {stranded.length > 0 && (
        <div className="tile p-3 flex flex-col gap-2">
          <div className="text-[12px] font-medium">Where should these applications go?</div>
          <p className="text-[12px] text-fg-2">Nothing is deleted. Each application moves to the stage you pick, and its history is rewritten to match.</p>
          {stranded.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-[12px] flex-wrap">
              <span className="min-w-[140px]">
                {s.label} <span className="text-muted tabular-nums">({s.count})</span>
              </span>
              <span className="text-muted">→</span>
              <select className="input h-8 text-[12px] w-auto" value={moves[s.id] ?? ""} onChange={(e) => setMoves((m) => ({ ...m, [s.id]: e.target.value }))}>
                <option value="">Choose a stage…</option>
                {current.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {dirty && (
        <div className="flex items-center gap-2 flex-wrap border-t border-line pt-3">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!canSave}>
            {saving ? "Saving…" : "Save pipeline"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset} disabled={saving}>
            Discard changes
          </button>
          {unassigned.length > 0 && <span className="text-[12px] text-warn">Say where {unassigned.map((s) => s.label).join(", ")} should move first.</span>}
        </div>
      )}

      <div className="border-t border-line pt-3 flex flex-col gap-2">
        <div className="section-title">Start from a template</div>
        <div className="flex flex-col gap-1.5">
          {STAGE_PRESETS.map((preset) => (
            <div key={preset.key} className="flex items-center gap-2 flex-wrap text-[12px]">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(preset.stages.map((s) => ({ ...s })))}>
                {preset.name}
              </button>
              <span className="text-muted">{preset.description}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          A template replaces the pipeline in the editor above; nothing is written until you save, and you will be asked where any stranded applications should go.
        </p>
      </div>

      <p className="text-[11px] text-muted">
        Renaming and recolouring are cosmetic: a stage keeps its identity, so your timeline and your stats survive. What a stage <em>means</em> is the phase — that is what
        decides whether something counts as a response, goes stale when it is quiet, or stops counting as active.
      </p>
    </div>
  );
}

/** Local draft while typing, committed on blur or Enter. */
function StageNameInput({ stage, onCommit }: { stage: Stage; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="input h-8 flex-1 min-w-0 text-[13px]"
      value={draft ?? stage.label}
      maxLength={MAX_STAGE_LABEL}
      aria-label={`Name for the ${stage.label} stage`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft?.trim();
        if (next && next !== stage.label) onCommit(next);
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

function AddStage({ onAdd, disabled }: { onAdd: (label: string, phase: StagePhase) => void; disabled: boolean }) {
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<StagePhase>("active");

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed || disabled) return;
    onAdd(trimmed, phase);
    setLabel("");
  };

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <label className="flex-1 min-w-[160px]">
        <span className="label">New stage</span>
        <input
          className="input h-8 text-[13px]"
          placeholder="Portfolio review, Case study, Licensing…"
          value={label}
          maxLength={MAX_STAGE_LABEL}
          disabled={disabled}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
      <label>
        <span className="label">What it means</span>
        <select className="input h-8 text-[12px] w-auto" value={phase} disabled={disabled} onChange={(e) => setPhase(e.target.value as StagePhase)}>
          {STAGE_PHASES.map((p) => (
            <option key={p} value={p}>
              {PHASE_INFO[p].title}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-tonal h-8" onClick={submit} disabled={disabled || label.trim() === ""}>
        <Icon name="plus" size={15} strokeWidth={2.2} />
        Add
      </button>
      <span className="text-[11px] text-muted basis-full">{disabled ? `Limit of ${MAX_STAGES} stages reached.` : PHASE_INFO[phase].blurb}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function ColumnsTab() {
  const { columns, user, savePrefs } = useSession();
  const [error, setError] = useState<string | null>(null);

  const write = (next: ColumnPref[]) => {
    setError(null);
    savePrefs({ ...user.prefs, columns: next }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not save"));
  };
  const current = (): ColumnPref[] => columns.map((c) => ({ key: c.key, ...(c.hidden ? { hidden: true } : {}) }));

  const move = (index: number, delta: number) => {
    const next = current();
    const to = index + delta;
    const item = next[index];
    const other = next[to];
    if (!item || !other) return;
    next[index] = other;
    next[to] = item;
    write(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-fg-2">Which columns the table view shows, and in what order. Stage and Company always stay.</p>
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
                onChange={() => write(current().map((c) => (c.key === column.key ? { ...c, hidden: !column.hidden } : c)))}
              />
              <span className="truncate">{column.label}</span>
            </label>
            {column.required && <span className="badge badge-muted shrink-0">always on</span>}
            {!column.sortable && <span className="badge badge-muted shrink-0">not sortable</span>}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => write(defaultColumnPrefs())}>
        <Icon name="undo" size={13} />
        Restore default columns
      </button>
      <p className="text-[11px] text-muted">The board view is unaffected; it always follows your pipeline.</p>
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
      <div className="text-[11px] text-muted">Every other device is signed out; this one stays in.</div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Automations: the per-user agent token
// ---------------------------------------------------------------------------

function AutomationsTab() {
  const { user, setUser, stages } = useSession();
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
  const prompt = agentPrompt(base, fresh ?? "YOUR_AGENT_TOKEN", stages.visible.map((s) => s.label));

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
          Paste into a Claude scheduled task{fresh ? " — your new token is already filled in" : ", then replace YOUR_AGENT_TOKEN"}. It reads your pipeline from the API, so it
          speaks your stage names.
        </p>
        <pre className="tile p-3 text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{prompt}</pre>
        <CopyButton text={prompt} label="Copy prompt" icon="copy" className="btn-tonal self-start" />
      </div>
    </div>
  );
}

function agentPrompt(base: string, token: string, stageLabels: string[]): string {
  return `You maintain my job application tracker. Base URL: ${base}
Auth: send header "Authorization: Bearer ${token}" on every request.

1. GET /api/agent/digest
2. My pipeline is mine, not a standard one — right now: ${stageLabels.join(" -> ")}.
   Read user.stages from the response for the current list: each entry has an id
   (what you send in a PATCH), a label (what you call it when writing to me), and a
   phase saying what it means ("active" = in progress with them, "closed" = over).
   Never suggest moving a row into a stage marked hidden.
3. Write me a short update, plain text, in this order and only if non-empty:
   - Needs attention: one line each, "Company - Role: reason". Suggest the single most useful next step. If the item has contacts, name who to write to and how long since lastContact.
   - Deadlines in the next 14 days.
   - Next actions due or overdue.
   - What moved in the last 7 days (recentActivity).
   - Snoozed: one line, "Company (until date)" each. No suggestions; I muted them on purpose.
   - One line of stats: active, applied, response rate, median days to response.
4. Do not change any data unless I ask. Never delete anything.`;
}
