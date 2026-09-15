import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultColumnPrefs, normalizePrefs, PREFS_VERSION, resolveColumns, resolveUserStages, stagesFromLegacyLanes, visibleColumns } from "../shared/prefs.js";
import {
  DEFAULT_STAGES,
  isTerminalPhase,
  MAX_STAGE_LABEL,
  resolveStages,
  sanitizeStages,
  SIMPLE_STAGES,
  stageIdFor,
  stagesProblem,
  STAGE_COLORS,
  STAGE_PRESETS,
  suggestColor,
  upgradeStagePhases,
  type Stage,
} from "../shared/stages.js";
import { classifyEventLabel, retargetEvents } from "../shared/timeline.js";
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

  it("reads its own ending the way it was labelled", () => {
    // `passed` is phase `closed` here, which is the pipeline saying "over" and
    // nothing more — so it cannot be read as the company having replied.
    assert.ok(!stages.isResponse("passed"));
    assert.ok(!stages.impliesApplied("passed"));

    const asRejection = resolveStages([...DESIGN_PIPELINE.slice(0, 5), { ...DESIGN_PIPELINE[5]!, phase: "rejected" }]);
    assert.ok(asRejection.isResponse("passed"), "said no is a reply");
    assert.ok(asRejection.impliesApplied("passed"));
    assert.ok(asRejection.isClosed("passed"), "and still ends the process");
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

describe("pipelines saved before a rejection counted as a response", () => {
  /** What Settings used to store: every ending on the one `closed` phase. */
  const beforeTheSplit = (): Stage[] => [
    { id: "applied", label: "Applied", color: "#3b82f6", phase: "waiting" },
    { id: "rejected", label: "Rejected", color: "#ef4444", phase: "closed" },
    { id: "ghosted", label: "Ghosted", color: "#71717a", phase: "closed" },
    { id: "withdrawn", label: "Withdrawn", color: "#52525b", phase: "closed" },
    { id: "passed_over", label: "Passed over", color: "#f97316", phase: "closed" },
  ];

  it("are upgraded on the way out, so a rejection starts counting", () => {
    const stages = resolveUserStages({ stages: beforeTheSplit() });
    assert.ok(stages.isResponse("rejected"), "the whole point of the split");
    assert.ok(stages.impliesApplied("rejected"));
    assert.ok(stages.impliesApplied("ghosted"));
    assert.ok(!stages.isResponse("ghosted"), "silence is not a reply");
  });

  it("leave the endings the split does not describe alone", () => {
    const stages = resolveUserStages({ stages: beforeTheSplit() });
    assert.equal(stages.get("withdrawn").phase, "closed");
    assert.equal(stages.get("passed_over").phase, "closed", "a stage of their own making is theirs to classify");
    assert.ok(!stages.impliesApplied("withdrawn"));
  });

  it("keep everything else about the stage", () => {
    const renamed = beforeTheSplit().map((s) => (s.id === "rejected" ? { ...s, label: "Turned down", hidden: true } : s));
    const stages = resolveUserStages({ stages: renamed });
    assert.equal(stages.label("rejected"), "Turned down");
    assert.ok(stages.get("rejected").hidden);
  });

  it("are upgraded on the way in too, since the columns editor resends them untouched", () => {
    const prefs = normalizePrefs({ stages: beforeTheSplit(), columns: [{ key: "tags" }] });
    assert.equal(prefs.stages?.find((s) => s.id === "rejected")?.phase, "rejected");
    assert.equal(prefs.v, PREFS_VERSION, "and stamped, so the upgrade never runs twice");
  });

  it("stop being upgraded once the pipeline editor has had its say", () => {
    // Someone who genuinely wants their Rejected stage to mean nothing but "over"
    // names the version, and the choice sticks on every read after it.
    const deliberate = { stages: beforeTheSplit(), v: PREFS_VERSION };
    assert.equal(normalizePrefs(deliberate).stages?.find((s) => s.id === "rejected")?.phase, "closed");
    assert.equal(resolveUserStages({ stages: beforeTheSplit(), v: PREFS_VERSION }).get("rejected").phase, "closed");
  });

  it("upgrade nothing when there is nothing to upgrade", () => {
    const current = DEFAULT_STAGES.map((s) => ({ ...s }));
    assert.deepEqual(upgradeStagePhases(current), current);
  });
});

describe("where a pipeline's tail begins", () => {
  it("is every phase that ends the process, not just `closed`", () => {
    for (const phase of ["rejected", "ghosted", "closed"] as const) assert.ok(isTerminalPhase(phase), phase);
    for (const phase of ["lead", "waiting", "active", "offer"] as const) assert.ok(!isTerminalPhase(phase), phase);
  });

  it("refuses a pipeline whose every visible stage is one of them", () => {
    const overBeforeItStarts: Stage[] = [
      { id: "rejected", label: "Rejected", color: "#ef4444", phase: "rejected" },
      { id: "ghosted", label: "Ghosted", color: "#71717a", phase: "ghosted" },
    ];
    assert.ok(stagesProblem(overBeforeItStarts));
    assert.equal(sanitizeStages(overBeforeItStarts), null);
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

// The events endpoint takes a bare label. Classifying it on the way in is what
// stops a note from being replayed as a stage change later.
describe("classifying a supplied timeline label", () => {
  const stages = resolveStages(DEFAULT_STAGES);
  const renamed = resolveStages(DEFAULT_STAGES.map((s) => (s.id === "oa" ? { ...s, label: "Take-home" } : s)));

  it("recognises the stage-completed marker", () => {
    assert.deepEqual(classifyEventLabel("Completed: Phone screen", stages), { kind: "stage_done", status: "phone_screen" });
  });

  it("matches the marker against the user's own stage names", () => {
    assert.deepEqual(classifyEventLabel("Completed: Take-home", renamed), { kind: "stage_done", status: "oa" });
    assert.deepEqual(classifyEventLabel("Completed: OA", renamed), { kind: "note" }, "the old name is no longer what this stage is called");
  });

  it("recognises a label that claims a stage change", () => {
    assert.deepEqual(classifyEventLabel("Status: Onsite", stages), { kind: "status", status: "onsite" });
  });

  it("treats anything else as prose, including near-misses on the prefixes", () => {
    for (const label of [
      "Recruiter replied, OA link sent",
      "Status: unclear, recruiter went quiet",
      "Completed: the take-home, took 4 hours",
      "Done: emailed Sarah",
      "status: onsite",
      "Completed:",
      "Onsite",
    ]) {
      assert.deepEqual(classifyEventLabel(label, stages), { kind: "note" }, label);
    }
  });

  it("tolerates whitespace around the stage name", () => {
    assert.deepEqual(classifyEventLabel("Completed:   Onsite  ", stages), { kind: "stage_done", status: "onsite" });
  });
});

describe("a note is never replayed as a stage change", () => {
  const stages = resolveStages(DEFAULT_STAGES);

  it("is ignored by both readers even when its label reads like a marker", () => {
    for (const label of ["Status: Onsite", "Completed: Onsite", "Recruiter replied"]) {
      const note: ApplicationEvent = { date: "2026-09-01", label, kind: "note" };
      assert.equal(statusFromEvent(note, stages), undefined, label);
      assert.equal(eventDisplayLabel(note, stages), label, "and still reads as written");
    }
  });

  it("unlike the same label stored without a kind, which is read from its text", () => {
    const legacy: ApplicationEvent = { date: "2026-09-01", label: "Status: Onsite" };
    assert.equal(statusFromEvent(legacy, stages), "onsite", "this is the behaviour marking notes protects against");
  });
});
