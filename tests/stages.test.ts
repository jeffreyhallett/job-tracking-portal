import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultColumnPrefs, normalizePrefs, resolveColumns, resolveUserStages, stagesFromLegacyLanes, visibleColumns } from "../shared/prefs.js";
import {
  DEFAULT_STAGES,
  MAX_STAGE_LABEL,
  resolveStages,
  sanitizeStages,
  SIMPLE_STAGES,
  stageIdFor,
  stagesProblem,
  STAGE_COLORS,
  STAGE_PRESETS,
  suggestColor,
  type Stage,
} from "../shared/stages.js";
import { retargetEvents } from "../shared/timeline.js";
import { eventDisplayLabel, stageDoneEvent, statusEvent, statusFromEvent, type ApplicationEvent } from "../shared/types.js";

const defaults = resolveStages(undefined);

/** A pipeline for a process that is nothing like the shipped one. */
const DESIGN_PIPELINE: Stage[] = [
  { id: "researching", label: "Researching", color: "#a1a1aa", phase: "lead" },
  { id: "applied", label: "Applied", color: "#3b82f6", phase: "waiting" },
  { id: "portfolio_review", label: "Portfolio review", color: "#a855f7", phase: "active" },
  { id: "design_exercise", label: "Design exercise", color: "#f59e0b", phase: "active" },
  { id: "offer", label: "Offer", color: "#22c55e", phase: "offer" },
  { id: "passed", label: "Passed on me", color: "#ef4444", phase: "closed" },
];

describe("a pipeline that is not the default one", () => {
  const stages = resolveStages(DESIGN_PIPELINE);

  it("keeps the stages it was given, in order", () => {
    assert.deepEqual(stages.ids, ["researching", "applied", "portfolio_review", "design_exercise", "offer", "passed"]);
    assert.equal(stages.label("portfolio_review"), "Portfolio review");
    assert.equal(stages.order("offer"), 4);
  });

  it("derives every meaning from the phases", () => {
    assert.ok(stages.isLead("researching"));
    assert.ok(!stages.impliesApplied("researching"));

    assert.ok(stages.isWaiting("applied"));
    assert.ok(stages.isInFlight("applied"));
    assert.ok(!stages.isResponse("applied"));

    for (const id of ["portfolio_review", "design_exercise"]) {
      assert.ok(stages.isResponse(id), id);
      assert.ok(stages.isInFlight(id), id);
      assert.ok(stages.isCompletable(id), id);
    }

    assert.ok(stages.isResponse("offer"));
    assert.ok(!stages.isInFlight("offer"), "the ball is with you at offer");

    assert.ok(stages.isClosed("passed"));
    assert.ok(!stages.isInFlight("passed"));
  });

  it("starts new applications in its own first stage", () => {
    assert.equal(stages.initial().id, "researching");
    assert.equal(resolveStages([{ id: "applied", label: "Applied", color: "#3b82f6", phase: "waiting" }]).initial().id, "applied", "no lead stage: the first one");
  });

  it("lets a stage opt out of being completable", () => {
    const noSitting = resolveStages([...DESIGN_PIPELINE.slice(0, 2), { ...DESIGN_PIPELINE[2]!, completable: false }, ...DESIGN_PIPELINE.slice(3)]);
    assert.equal(noSitting.isCompletable("portfolio_review"), false);
    assert.ok(noSitting.isResponse("portfolio_review"), "and still counts as a response");
  });
});

describe("a stage the pipeline no longer has", () => {
  const stages = resolveStages(SIMPLE_STAGES);

  it("is still displayable, and readably named", () => {
    assert.ok(stages.isUnknown("phone_screen"));
    assert.equal(stages.label("phone_screen"), "Phone screen");
    assert.equal(stages.color("phone_screen"), STAGE_COLORS[0]?.value ?? "#a1a1aa");
  });

  it("sorts last rather than jumping to the front", () => {
    assert.ok(stages.order("phone_screen") >= stages.all.length);
  });

  it("is inert, so a stray row cannot distort the stats", () => {
    assert.ok(!stages.isResponse("phone_screen"));
    assert.ok(!stages.impliesApplied("phone_screen"));
    assert.ok(!stages.isInFlight("phone_screen"));
    assert.ok(!stages.isClosed("phone_screen"));
  });
});

describe("validating a pipeline", () => {
  it("accepts the presets", () => {
    for (const preset of STAGE_PRESETS) assert.equal(stagesProblem(preset.stages), null, preset.key);
  });

  it("refuses one with nowhere to put a live application", () => {
    const allClosed: Stage[] = [{ id: "rejected", label: "Rejected", color: "#ef4444", phase: "closed" }];
    assert.ok(stagesProblem(allClosed));
    assert.equal(sanitizeStages(allClosed), null);
  });

  it("refuses an empty pipeline, a nameless stage, and duplicate ids", () => {
    assert.ok(stagesProblem([]));
    assert.ok(stagesProblem([{ id: "a", label: "   ", color: "#a1a1aa", phase: "lead" }]));
    assert.ok(
      stagesProblem([
        { id: "a", label: "A", color: "#a1a1aa", phase: "lead" },
        { id: "a", label: "B", color: "#3b82f6", phase: "active" },
      ]),
    );
  });

  it("falls back to the defaults rather than leaving someone with no pipeline", () => {
    assert.deepEqual(resolveStages(sanitizeStages([]) ?? undefined).ids, defaults.ids);
    assert.deepEqual(resolveUserStages({ stages: [] }).ids, defaults.ids);
    assert.deepEqual(resolveUserStages(undefined).ids, defaults.ids);
  });
});

describe("cleaning a submitted pipeline", () => {
  it("drops junk, collapses duplicates, and fills in what is missing", () => {
    const cleaned = sanitizeStages([
      { id: "GOOD", label: "  Good  ", color: "#22c55e", phase: "active" },
      { id: "good", label: "Duplicate", color: "#22c55e", phase: "active" },
      { id: "bad id!", label: "Bad", color: "#22c55e", phase: "active" },
      { id: "no_label", label: "", color: "not-a-colour", phase: "nonsense" },
      "not an object",
    ]);
    assert.ok(cleaned);
    assert.deepEqual(
      cleaned.map((s) => s.id),
      ["good", "no_label"],
    );
    assert.equal(cleaned[0]?.label, "Good", "trimmed and lowercased id, trimmed label");
    assert.equal(cleaned[1]?.label, "No label", "a blank label falls back to the humanised id");
    assert.equal(cleaned[1]?.phase, "active", "an unknown phase falls back rather than being rejected");
    assert.ok(STAGE_COLORS.some((c) => c.value === cleaned[1]?.color), "an off-palette colour is replaced");
  });

  it("caps the label length", () => {
    const cleaned = sanitizeStages([{ id: "long", label: "x".repeat(500), color: "#22c55e", phase: "active" }]);
    assert.equal(cleaned?.[0]?.label.length, MAX_STAGE_LABEL);
  });

  it("only stores `completable` when it disagrees with the phase", () => {
    const same = sanitizeStages([{ id: "a", label: "A", color: "#a855f7", phase: "active", completable: true }]);
    assert.equal(same?.[0]?.completable, undefined);
    const differs = sanitizeStages([{ id: "a", label: "A", color: "#a855f7", phase: "active", completable: false }]);
    assert.equal(differs?.[0]?.completable, false);
  });
});

describe("adding a stage", () => {
  it("slugs the name and never collides", () => {
    assert.equal(stageIdFor("Portfolio Review", []), "portfolio_review");
    assert.equal(stageIdFor("  Case study!  ", []), "case_study");
    assert.equal(stageIdFor("Offer", ["offer"]), "offer_2");
    assert.equal(stageIdFor("Offer", ["offer", "offer_2"]), "offer_3");
    assert.equal(stageIdFor("!!!", []), "stage");
  });

  it("suggests a colour that is not already taken" , () => {
    const used = STAGE_COLORS.slice(0, 3).map((c) => c.value);
    assert.ok(!used.includes(suggestColor("active", used)) || STAGE_COLORS.length <= 3);
  });
});

describe("renaming and deleting never orphan history", () => {
  const before = resolveStages(DEFAULT_STAGES);
  const renamed = resolveStages(DEFAULT_STAGES.map((s) => (s.id === "phone_screen" ? { ...s, label: "Recruiter call" } : s)));

  it("stores the stage id, not the label", () => {
    const event = statusEvent("phone_screen", "2026-09-01", before);
    assert.equal(event.status, "phone_screen");
    assert.equal(event.kind, "status");
    assert.equal(statusFromEvent(event, renamed), "phone_screen", "still readable after the rename");
    assert.equal(eventDisplayLabel(event, renamed), "Status: Recruiter call", "and reads in the new words");
  });

  it("still reads entries written before events carried ids", () => {
    const legacy: ApplicationEvent = { date: "2026-08-01", label: "Status: Phone screen" };
    assert.equal(statusFromEvent(legacy, renamed), "phone_screen");
    assert.equal(eventDisplayLabel(legacy, renamed), "Status: Recruiter call");
  });

  it("leaves free text alone", () => {
    const note: ApplicationEvent = { date: "2026-08-01", label: "Recruiter replied, link sent", details: "via email" };
    assert.equal(statusFromEvent(note, before), undefined);
    assert.equal(eventDisplayLabel(note, before), "Recruiter replied, link sent");
  });

  it("moves history onto the target stage when one is deleted", () => {
    const after = resolveStages(SIMPLE_STAGES);
    const events: ApplicationEvent[] = [
      statusEvent("applied", "2026-08-01", before),
      statusEvent("phone_screen", "2026-08-10", before),
      stageDoneEvent("phone_screen", "2026-08-12", before),
      { date: "2026-08-11", label: "Spoke to Sam", details: "went well" },
      { date: "2026-08-05", label: "Status: Phone screen" }, // written before ids existed
    ];
    const moved = retargetEvents(events, "phone_screen", "interviewing", before, after);

    assert.equal(statusFromEvent(moved[1]!, after), "interviewing");
    assert.equal(moved[1]?.label, "Status: Interviewing");
    assert.equal(moved[2]?.kind, "stage_done");
    assert.equal(moved[2]?.status, "interviewing");
    assert.deepEqual(moved[3], events[3], "free text untouched");
    assert.equal(statusFromEvent(moved[4]!, after), "interviewing", "the legacy entry is upgraded too");
    assert.equal(statusFromEvent(moved[0]!, after), "applied", "other stages untouched");
    assert.ok(!moved.some((e) => e.status === "phone_screen"), "nothing still points at the deleted stage");
  });

  it("keeps the details of an entry it retargets", () => {
    const after = resolveStages(SIMPLE_STAGES);
    const withDetails: ApplicationEvent = { ...statusEvent("onsite", "2026-08-20", before), details: "three rounds" };
    const [moved] = retargetEvents([withDetails], "onsite", "interviewing", before, after);
    assert.equal(moved?.details, "three rounds");
  });
});

describe("accounts set up before stages were editable", () => {
  it("carry their lane names, order and hiding over", () => {
    const stages = resolveUserStages({ lanes: [{ status: "phone_screen", label: "Recruiter call" }, { status: "ghosted", hidden: true }] });
    assert.equal(stages.label("phone_screen"), "Recruiter call");
    assert.equal(stages.order("phone_screen"), 0, "the order they listed is kept");
    assert.ok(stages.get("ghosted").hidden);
    assert.equal(stages.all.length, DEFAULT_STAGES.length, "and no stage is lost");
  });

  it("keep the phases of the defaults they were built from", () => {
    const stages = resolveUserStages({ lanes: [{ status: "oa", label: "Take-home" }] });
    assert.equal(stages.get("oa").phase, "active");
    assert.ok(stages.isResponse("oa"));
  });

  it("ignore a lane naming a stage that never existed", () => {
    assert.equal(stagesFromLegacyLanes([{ status: "nonsense" }]).length, DEFAULT_STAGES.length);
  });

  it("are superseded once a real pipeline is stored", () => {
    const stages = resolveUserStages({ stages: SIMPLE_STAGES.map((s) => ({ ...s })), lanes: [{ status: "oa", label: "Ignored" }] });
    assert.deepEqual(
      stages.ids,
      SIMPLE_STAGES.map((s) => s.id),
    );
  });
});

describe("normalizePrefs", () => {
  it("keeps a usable pipeline and drops an unusable one", () => {
    assert.ok(normalizePrefs({ stages: SIMPLE_STAGES.map((s) => ({ ...s })) }).stages);
    assert.equal(normalizePrefs({ stages: [] }).stages, undefined);
    assert.equal(normalizePrefs({ stages: [{ id: "x", label: "X", color: "#ef4444", phase: "closed" }] }).stages, undefined, "nothing but closed stages");
  });

  it("handles the columns independently of the pipeline", () => {
    const prefs = normalizePrefs({ columns: [{ key: "tags" }, { key: "status", hidden: true }, { key: "nope" }] });
    assert.equal(prefs.stages, undefined);
    assert.equal(prefs.columns?.[0]?.key, "tags");
    assert.ok(!prefs.columns?.some((c) => c.key === ("nope" as never)));
    assert.equal(prefs.columns?.find((c) => c.key === "status")?.hidden, undefined, "a required column cannot be hidden");
  });
});

describe("table columns", () => {
  it("shows the shipped set when nothing is stored", () => {
    assert.equal(visibleColumns(resolveColumns(undefined)).length, 8);
    assert.deepEqual(
      visibleColumns(resolveColumns({ columns: defaultColumnPrefs() })).map((c) => c.key),
      visibleColumns(resolveColumns(undefined)).map((c) => c.key),
    );
  });

  it("always keeps stage and company", () => {
    const columns = visibleColumns(resolveColumns({ columns: [{ key: "status", hidden: true }, { key: "company", hidden: true }] }));
    assert.ok(columns.some((c) => c.key === "status"));
    assert.ok(columns.some((c) => c.key === "company"));
  });
});
