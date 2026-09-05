import { useCallback, useState } from "react";
import { STATUS_LABELS, type Application } from "../../shared/types";
import {
  buildBulkRequest,
  CLAUDE_PROMPT,
  contextForClaude,
  defaultSelection,
  parsePaste,
  planImport,
  type FieldChange,
  type ImportPlan,
  type PlanSelection,
} from "../lib/import";
import type { Store } from "../state/store";
import { CopyButton, Modal, StatusDot } from "./ui";

type Props = { apps: Application[]; store: Store; onClose: () => void };

type Stage = { kind: "input" } | { kind: "preview"; plan: ImportPlan; sel: PlanSelection } | { kind: "applying"; plan: ImportPlan; sel: PlanSelection } | { kind: "done"; created: number; updated: number };

export function SyncModal({ apps, store, onClose }: Props) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "input" });
  const [fatal, setFatal] = useState<string | null>(null);

  const preview = useCallback(() => {
    const parsed = parsePaste(text);
    if (parsed.fatal) {
      setFatal(parsed.fatal);
      return;
    }
    setFatal(null);
    const plan = planImport(parsed, apps);
    setStage({ kind: "preview", plan, sel: defaultSelection(plan) });
  }, [text, apps]);

  const apply = async (plan: ImportPlan, sel: PlanSelection) => {
    setStage({ kind: "applying", plan, sel });
    setFatal(null);
    try {
      const result = await store.bulk(buildBulkRequest(plan, sel));
      setStage({ kind: "done", created: result.created.length, updated: result.updated.length });
    } catch (e) {
      setFatal(e instanceof Error ? `Nothing was written: ${e.message}` : "Nothing was written.");
      setStage({ kind: "preview", plan, sel });
    }
  };

  return (
    <Modal title="Sync from Claude" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <details className="rounded border border-line">
          <summary className="cursor-pointer select-none px-2 h-7 flex items-center text-[12px] text-fg-2 hover:text-fg">Prompt to run in Claude</summary>
          <div className="px-2 pb-2 flex flex-col gap-2">
            <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.45] text-fg-2 bg-bg rounded border border-line p-2 max-h-48 overflow-y-auto">{CLAUDE_PROMPT}</pre>
            <div className="flex items-center gap-2 flex-wrap">
              <CopyButton text={CLAUDE_PROMPT} label="Copy prompt" />
              <CopyButton text={() => contextForClaude(apps)} label="Copy context" />
              <span className="text-[11px] text-muted">Context is {apps.length} rows of company, role, url, status only. Replace the bracketed parts in the prompt.</span>
            </div>
          </div>
        </details>

        {stage.kind === "input" && (
          <>
            <textarea
              className="input font-mono text-[12px] min-h-[220px]"
              placeholder='[{"company": "…", "role": "…", "url": "…"}]'
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            {fatal && <div className="text-[12px] text-danger">{fatal}</div>}
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={text.trim() === ""} onClick={preview}>
                Preview changes
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <span className="text-[11px] text-muted ml-auto">Nothing is written until you confirm.</span>
            </div>
          </>
        )}

        {(stage.kind === "preview" || stage.kind === "applying") && (
          <Preview
            plan={stage.plan}
            sel={stage.sel}
            busy={stage.kind === "applying"}
            error={fatal}
            onSel={(sel) => setStage({ kind: "preview", plan: stage.plan, sel })}
            onBack={() => {
              setFatal(null);
              setStage({ kind: "input" });
            }}
            onApply={() => void apply(stage.plan, stage.sel)}
          />
        )}

        {stage.kind === "done" && (
          <div className="flex flex-col gap-2">
            <div className="text-sm">
              Done. Created {stage.created}, updated {stage.updated}.
            </div>
            <div>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

type PreviewProps = {
  plan: ImportPlan;
  sel: PlanSelection;
  busy: boolean;
  error: string | null;
  onSel: (sel: PlanSelection) => void;
  onBack: () => void;
  onApply: () => void;
};

function Preview({ plan, sel, busy, error, onSel, onBack, onApply }: PreviewProps) {
  const createCount = plan.creates.filter((c) => sel.includeCreates.has(c.index)).length;
  const updateCount = plan.updates.filter((u) => sel.includeUpdates.has(u.existing.id)).length;
  const unchanged = plan.skips.filter((s) => s.reason === "unchanged").length;
  const dupes = plan.skips.filter((s) => s.reason === "duplicate").length;
  const total = createCount + updateCount;

  const toggle = <T,>(set: Set<T>, key: T): Set<T> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] text-fg-2 flex gap-x-3 flex-wrap tabular-nums">
        <span>
          <b className="text-fg">{plan.creates.length}</b> new
        </span>
        <span>
          <b className="text-fg">{plan.updates.length}</b> updated
        </span>
        <span>
          <b className="text-fg">{unchanged}</b> unchanged, skipped
        </span>
        {dupes > 0 && (
          <span>
            <b className="text-fg">{dupes}</b> duplicate in paste
          </span>
        )}
        {plan.errors.length > 0 && (
          <span className="text-danger">
            <b>{plan.errors.length}</b> with errors
          </span>
        )}
      </div>

      {plan.errors.length > 0 && (
        <Section title="Errors (rows skipped)">
          {plan.errors.map((e) => (
            <div key={e.index} className="py-1 border-b border-line last:border-0">
              <div className="text-[12px]">
                <span className="text-muted tabular-nums mr-2">#{e.index + 1}</span>
                {e.label}
              </div>
              <ul className="text-[11px] text-danger pl-4 list-disc">
                {e.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {plan.creates.length > 0 && (
        <Section title={`New (${createCount} of ${plan.creates.length} selected)`}>
          {plan.creates.map((c) => (
            <label key={c.index} className="flex items-start gap-2 py-1 border-b border-line last:border-0 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={sel.includeCreates.has(c.index)} onChange={() => onSel({ ...sel, includeCreates: toggle(sel.includeCreates, c.index) })} />
              <div className="min-w-0 flex-1 text-[12px]">
                <div>
                  <span className="font-medium">{c.input.company}</span> <span className="text-fg-2">{c.input.role}</span>
                </div>
                <div className="text-[11px] text-muted truncate">
                  {[c.input.location, c.input.workModel, c.input.deadline && `due ${c.input.deadline}`, c.input.compensation, c.input.url].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="text-[11px] text-muted flex items-center gap-1">
                <StatusDot status={c.input.status} className="w-1.5 h-1.5" />
                {STATUS_LABELS[c.input.status]}
              </span>
            </label>
          ))}
        </Section>
      )}

      {plan.updates.length > 0 && (
        <Section title={`Updated (${updateCount} of ${plan.updates.length} selected)`}>
          {plan.updates.map((u) => {
            const on = sel.includeUpdates.has(u.existing.id);
            return (
              <div key={u.existing.id} className="py-1 border-b border-line last:border-0">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={on} onChange={() => onSel({ ...sel, includeUpdates: toggle(sel.includeUpdates, u.existing.id) })} />
                  <div className="min-w-0 flex-1 text-[12px]">
                    <span className="font-medium">{u.existing.company}</span> <span className="text-fg-2">{u.existing.role}</span>
                    <span className="text-[11px] text-muted ml-2">matched by {u.matchedBy === "url" ? "URL" : "name"}</span>
                  </div>
                </label>
                <div className={`pl-6 mt-0.5 flex flex-col gap-0.5 ${on ? "" : "opacity-50"}`}>
                  {u.changes.map((c) => (
                    <Change key={c.field} change={c} />
                  ))}
                  {u.statusChange && (
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!on}
                        checked={sel.acceptStatus.has(u.existing.id)}
                        onChange={() => onSel({ ...sel, acceptStatus: toggle(sel.acceptStatus, u.existing.id) })}
                      />
                      <span className="text-muted w-24 shrink-0">status</span>
                      <span className="flex items-center gap-1">
                        <StatusDot status={u.statusChange.from} className="w-1.5 h-1.5" />
                        {STATUS_LABELS[u.statusChange.from]}
                      </span>
                      <span className="text-muted">to</span>
                      <span className="flex items-center gap-1">
                        <StatusDot status={u.statusChange.to} className="w-1.5 h-1.5" />
                        {STATUS_LABELS[u.statusChange.to]}
                      </span>
                      <span className="text-muted">(off by default; your status is never overwritten silently)</span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {unchanged > 0 && (
        <Section title={`Unchanged (${unchanged})`} collapsed>
          {plan.skips
            .filter((s) => s.reason === "unchanged")
            .map((s) => (
              <div key={s.index} className="text-[12px] py-0.5 text-fg-2">
                {s.existing.company} <span className="text-muted">{s.existing.role}</span>
              </div>
            ))}
        </Section>
      )}

      {error && <div className="text-[12px] text-danger border border-danger/40 rounded px-2 py-1">{error}</div>}

      <div className="flex items-center gap-2 sticky bottom-0 bg-panel pt-1">
        <button type="button" className="btn btn-primary" disabled={busy || total === 0} onClick={onApply}>
          {busy ? "Writing…" : `Apply ${total} change${total === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onBack}>
          Back
        </button>
        <span className="text-[11px] text-muted ml-auto">Written in one transaction: all or nothing.</span>
      </div>
    </div>
  );
}

function Section({ title, children, collapsed = false }: { title: string; children: React.ReactNode; collapsed?: boolean }) {
  return (
    <details open={!collapsed} className="rounded border border-line">
      <summary className="cursor-pointer select-none px-2 h-7 flex items-center text-[12px] font-medium">{title}</summary>
      <div className="px-2 pb-1">{children}</div>
    </details>
  );
}

function Change({ change }: { change: FieldChange }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-muted w-24 shrink-0">{FIELD_NAMES[change.field] ?? change.field}</span>
      {change.before !== undefined && change.before !== "" && !(Array.isArray(change.before) && change.before.length === 0) && (
        <>
          <span className="line-through text-muted truncate max-w-[40%]">{show(change.before)}</span>
          <span className="text-muted">→</span>
        </>
      )}
      <span className="truncate">{show(change.after)}</span>
    </div>
  );
}

const FIELD_NAMES: Partial<Record<FieldChange["field"], string>> = {
  workModel: "work model",
  appliedDate: "applied",
  resumeVersion: "resume",
  nextAction: "next action",
  nextActionDate: "next action date",
};

function show(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (v === undefined || v === null) return "";
  return String(v);
}
