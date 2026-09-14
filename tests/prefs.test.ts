import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TABLE_COLUMNS,
  defaultColumnPrefs,
  defaultLanePrefs,
  displayEventLabel,
  normalizePrefs,
  resolveColumns,
  resolveLanes,
  resolveStatusLabels,
  resolveStatusOrder,
  visibleColumns,
  visibleLanes,
} from "../shared/prefs.js";
import { STATUSES, STATUS_LABELS, stageDoneEventLabel, statusEventLabel, statusFromEventLabel } from "../shared/types.js";

describe("defaults", () => {
  it("shows every lane in the shipped order with the shipped names", () => {
    assert.deepEqual(
      resolveLanes(undefined).map((l) => l.status),
      [...STATUSES],
    );
    assert.deepEqual(resolveStatusLabels(undefined), STATUS_LABELS);
    assert.ok(resolveLanes(undefined).every((l) => !l.hidden));
  });

  it("round-trips through the default-pref helpers", () => {
    assert.deepEqual(resolveLanes({ lanes: defaultLanePrefs() }), resolveLanes(undefined));
    assert.deepEqual(
      visibleColumns(resolveColumns({ columns: defaultColumnPrefs() })).map((c) => c.key),
      visibleColumns(resolveColumns(undefined)).map((c) => c.key),
    );
  });
});

describe("renaming a lane", () => {
  const prefs = normalizePrefs({ lanes: [{ status: "phone_screen", label: "  Recruiter call  " }] });

  it("trims and stores the override", () => {
    assert.equal(resolveStatusLabels(prefs).phone_screen, "Recruiter call");
    assert.equal(resolveLanes(prefs).find((l) => l.status === "phone_screen")?.renamed, true);
  });

  it("leaves the other lanes alone", () => {
    assert.equal(resolveStatusLabels(prefs).offer, "Offer");
    assert.equal(resolveLanes(prefs).find((l) => l.status === "offer")?.renamed, false);
  });

  it("treats a blank name, or the default name, as no override", () => {
    for (const label of ["", "   ", STATUS_LABELS.offer]) {
      const p = normalizePrefs({ lanes: [{ status: "offer", label }] });
      assert.equal(p.lanes?.find((l) => l.status === "offer")?.label, undefined, JSON.stringify(label));
      assert.equal(resolveStatusLabels(p).offer, STATUS_LABELS.offer);
    }
  });

  it("caps a very long name", () => {
    const p = normalizePrefs({ lanes: [{ status: "oa", label: "x".repeat(500) }] });
    assert.equal(p.lanes?.find((l) => l.status === "oa")?.label?.length, 40);
  });
});

describe("reordering and hiding lanes", () => {
  const prefs = normalizePrefs({ lanes: [{ status: "offer" }, { status: "applied" }, { status: "ghosted", hidden: true }] });

  it("sorts by the stored order", () => {
    const order = resolveStatusOrder(prefs);
    assert.equal(order.offer, 0);
    assert.equal(order.applied, 1);
    assert.ok(STATUSES.every((s) => typeof order[s] === "number"), "every status needs a sort weight");
  });

  it("drops hidden lanes from the visible set but keeps them in the full one", () => {
    assert.ok(!visibleLanes(resolveLanes(prefs)).some((l) => l.status === "ghosted"));
    assert.ok(resolveLanes(prefs).some((l) => l.status === "ghosted" && l.hidden));
  });
});

describe("a stale or hand-edited preference blob", () => {
  it("never makes a stage disappear from the app", () => {
    const junk = { lanes: [{ status: "not_a_status" }, { status: "applied" }, { status: "applied" }] } as never;
    assert.equal(resolveLanes(normalizePrefs(junk)).length, STATUSES.length);
    assert.equal(resolveLanes(junk).length, STATUSES.length);
    assert.equal(resolveLanes({ lanes: [] }).length, STATUSES.length);
  });

  it("drops unknown statuses and collapses duplicates on the way in", () => {
    const cleaned = normalizePrefs({ lanes: [{ status: "not_a_status" }, { status: "applied" }, { status: "applied" }] } as never);
    assert.ok(!cleaned.lanes?.some((l) => (l.status as string) === "not_a_status"));
    assert.equal(cleaned.lanes?.filter((l) => l.status === "applied").length, 1);
  });
});

describe("table columns", () => {
  const prefs = normalizePrefs({ columns: [{ key: "tags" }, { key: "status", hidden: true }, { key: "nope" }] } as never);

  it("drops unknown keys and keeps the order that is left", () => {
    assert.ok(!prefs.columns?.some((c) => (c.key as string) === "nope"));
    assert.equal(prefs.columns?.[0]?.key, "tags");
    assert.equal(prefs.columns?.length, TABLE_COLUMNS.length);
  });

  it("refuses to hide the columns the table cannot do without", () => {
    const visible = visibleColumns(resolveColumns(prefs)).map((c) => c.key);
    assert.ok(visible.includes("status"));
    assert.ok(visible.includes("company"));
  });

  it("treats columns missing from an explicit list as hidden", () => {
    assert.ok(!visibleColumns(resolveColumns(prefs)).some((c) => c.key === "compensation"));
  });
});

// This is the invariant that makes renaming safe to ship. Status changes are
// recorded on the timeline as "Status: <built-in name>" and the stats replay
// that timeline. If a rename rewrote those labels, or if display translation
// leaked into what gets stored, every response rate and median-days figure
// recorded before the rename would silently stop counting.
describe("renaming does not rewrite history", () => {
  const labels = resolveStatusLabels(normalizePrefs({ lanes: [{ status: "phone_screen", label: "Recruiter call" }] }));

  it("keeps stored labels canonical and parseable", () => {
    assert.equal(statusEventLabel("phone_screen"), "Status: Phone screen");
    for (const status of STATUSES) {
      assert.equal(statusFromEventLabel(statusEventLabel(status)), status);
    }
  });

  it("translates only for display", () => {
    assert.equal(displayEventLabel("Status: Phone screen", labels), "Status: Recruiter call");
    assert.equal(displayEventLabel(stageDoneEventLabel("phone_screen"), labels), "Completed: Recruiter call");
  });

  it("leaves untouched lanes and free-text entries exactly as they are", () => {
    assert.equal(displayEventLabel("Status: Offer", labels), "Status: Offer");
    assert.equal(displayEventLabel("Recruiter replied, OA link sent", labels), "Recruiter replied, OA link sent");
  });

  it("is the identity when nothing has been renamed", () => {
    for (const status of STATUSES) {
      assert.equal(displayEventLabel(statusEventLabel(status), STATUS_LABELS), statusEventLabel(status));
      assert.equal(displayEventLabel(stageDoneEventLabel(status), STATUS_LABELS), stageDoneEventLabel(status));
    }
  });
});
