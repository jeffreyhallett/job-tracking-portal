// Behaviour lock for the three modules that read meaning out of a stage:
// attention rules, stats, and the timeline's "stage complete" marker.
//
// These assertions describe the app as it shipped with nine fixed stages. They
// exist so that making stages per-user data cannot quietly change anybody's
// response rate, median-days figure, or stale flags. The expected values below
// were written against the pre-custom-stages behaviour; if one of them has to
// change, that is a real behaviour change and needs to be a deliberate one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attentionReasons, describeReason, isSnoozed, needsAttention, rawAttentionReasons } from "../shared/attention.js";
import { DEFAULT_STAGES, resolveStages } from "../shared/stages.js";
import { appliedOn, computeStats, firstResponseOn, weeklyFunnel } from "../shared/stats.js";
import { isCompletableStage, stageCompletedOn, withoutStageDone, withStageDone } from "../shared/timeline.js";
import { statusEventLabel, type Application, type ApplicationEvent } from "../shared/types.js";

/** The stage set every assertion here runs against: exactly what ships. */
const stages = resolveStages(undefined);

const DAY = 86_400_000;
const NOW = new Date("2026-09-14T12:00:00Z");
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
const day = (daysAgo: number) => iso(daysAgo).slice(0, 10);

function app(over: Partial<Application> = {}): Application {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    company: "Acme",
    role: "Software Engineer",
    status: "interested",
    events: [],
    createdAt: iso(30),
    updatedAt: iso(0),
    ...over,
  };
}

/** A status-change event, the way the app records one. */
const moved = (status: string, daysAgo: number): ApplicationEvent => ({ date: day(daysAgo), label: statusEventLabel(status, stages), status, kind: "status" });

describe("attention: stale", () => {
  it("flags an in-flight row untouched for more than 14 days", () => {
    for (const status of ["applied", "oa", "phone_screen", "onsite"]) {
      const reasons = rawAttentionReasons(app({ status, updatedAt: iso(20) }), stages, NOW);
      assert.deepEqual(reasons, [{ kind: "stale", days: 20 }], status);
    }
  });

  it("does not flag one touched inside the window, or exactly at it", () => {
    assert.deepEqual(rawAttentionReasons(app({ status: "applied", updatedAt: iso(14) }), stages, NOW), []);
    assert.deepEqual(rawAttentionReasons(app({ status: "applied", updatedAt: iso(3) }), stages, NOW), []);
  });

  it("never flags a stage where the ball is not with the company", () => {
    for (const status of ["interested", "offer", "rejected", "ghosted", "withdrawn"]) {
      assert.deepEqual(rawAttentionReasons(app({ status, updatedAt: iso(90) }), stages, NOW), [], status);
    }
  });
});

describe("attention: next action and deadline", () => {
  it("flags a next action due today or overdue, and not a future one", () => {
    assert.deepEqual(rawAttentionReasons(app({ nextActionDate: day(0) }), stages, NOW), [{ kind: "action_due", days: 0 }]);
    assert.deepEqual(rawAttentionReasons(app({ nextActionDate: day(3) }), stages, NOW), [{ kind: "action_due", days: 3 }]);
    assert.deepEqual(rawAttentionReasons(app({ nextActionDate: day(-2) }), stages, NOW), []);
  });

  it("flags a deadline inside 7 days only before anything has been sent", () => {
    assert.deepEqual(rawAttentionReasons(app({ status: "interested", deadline: day(-3) }), stages, NOW), [{ kind: "deadline_soon", days: 3 }]);
    // Already applied: the deadline has stopped mattering.
    assert.deepEqual(rawAttentionReasons(app({ status: "applied", deadline: day(-3), updatedAt: iso(0) }), stages, NOW), []);
  });

  it("keeps flagging a deadline that has already passed", () => {
    assert.deepEqual(rawAttentionReasons(app({ status: "interested", deadline: day(2) }), stages, NOW), [{ kind: "deadline_soon", days: -2 }]);
  });

  it("reports several reasons at once", () => {
    const reasons = rawAttentionReasons(app({ status: "applied", updatedAt: iso(30), nextActionDate: day(1) }), stages, NOW);
    assert.deepEqual(reasons.map((r) => r.kind).sort(), ["action_due", "stale"]);
  });
});

describe("attention: snooze", () => {
  const snoozed = app({ status: "applied", updatedAt: iso(40), snoozedUntil: day(-5) });

  it("mutes the reasons that count while leaving the raw ones visible", () => {
    assert.ok(isSnoozed(snoozed, NOW));
    assert.deepEqual(attentionReasons(snoozed, stages, NOW), []);
    assert.equal(needsAttention(snoozed, stages, NOW), false);
    assert.equal(rawAttentionReasons(snoozed, stages, NOW).length, 1);
  });

  it("stops muting once the date has passed", () => {
    const expired = app({ status: "applied", updatedAt: iso(40), snoozedUntil: day(1) });
    assert.ok(!isSnoozed(expired, NOW));
    assert.equal(needsAttention(expired, stages, NOW), true);
  });
});

describe("attention wording", () => {
  it("reads the way the digest and the badges print it", () => {
    assert.equal(describeReason({ kind: "stale", days: 20 }), "no movement in 20d");
    assert.equal(describeReason({ kind: "action_due", days: 0 }), "action due today");
    assert.equal(describeReason({ kind: "action_due", days: 3 }), "action 3d overdue");
    assert.equal(describeReason({ kind: "deadline_soon", days: 0 }), "deadline today");
    assert.equal(describeReason({ kind: "deadline_soon", days: 4 }), "deadline in 4d");
    assert.equal(describeReason({ kind: "deadline_soon", days: -2 }), "deadline passed 2d ago");
  });
});

describe("stats: replaying the timeline", () => {
  it("takes the applied and first-response dates from the events", () => {
    const row = app({ status: "oa", events: [moved("interested", 30), moved("applied", 20), moved("oa", 13)] });
    assert.equal(appliedOn(row, stages), day(20));
    assert.equal(firstResponseOn(row, stages), day(13));
  });

  it("keeps the first response when later stages follow", () => {
    const row = app({ status: "onsite", events: [moved("applied", 20), moved("oa", 13), moved("phone_screen", 9), moved("onsite", 4)] });
    assert.equal(firstResponseOn(row, stages), day(13));
  });

  it("treats a move back to applied as undoing the response above it", () => {
    const row = app({ status: "applied", events: [moved("applied", 20), moved("oa", 13), moved("applied", 10)] });
    assert.equal(appliedOn(row, stages), day(20), "the original apply date stands");
    assert.equal(firstResponseOn(row, stages), undefined);
  });

  it("treats a move back to interested as undoing the apply too", () => {
    const row = app({ status: "interested", events: [moved("applied", 20), moved("oa", 13), moved("interested", 10)] });
    assert.equal(appliedOn(row, stages), undefined);
    assert.equal(firstResponseOn(row, stages), undefined);
  });

  it("does not restart the clock when someone re-applies", () => {
    const row = app({ status: "applied", events: [moved("applied", 20), moved("applied", 5)] });
    assert.equal(appliedOn(row, stages), day(20));
  });

  it("falls back to appliedDate when the timeline never recorded the move", () => {
    assert.equal(appliedOn(app({ status: "applied", appliedDate: day(9), events: [] }), stages), day(9));
  });
});

describe("stats: the strip numbers", () => {
  it("counts everything that is not in a terminal stage as active", () => {
    const rows = [app({ status: "interested" }), app({ status: "onsite" }), app({ status: "offer" }), app({ status: "rejected" }), app({ status: "ghosted" }), app({ status: "withdrawn" })];
    assert.equal(computeStats(rows, stages).active, 3);
  });

  it("counts a row as applied from its stage even with an empty timeline", () => {
    for (const status of ["applied", "oa", "phone_screen", "onsite", "offer"]) {
      assert.equal(computeStats([app({ status })], stages).applied, 1, status);
    }
    assert.equal(computeStats([app({ status: "interested" })], stages).applied, 0);
  });

  it("computes the response rate over applied rows only", () => {
    const rows = [
      app({ status: "applied", events: [moved("applied", 20)] }),
      app({ status: "oa", events: [moved("applied", 20), moved("oa", 15)] }),
      app({ status: "interested" }),
    ];
    const stats = computeStats(rows, stages);
    assert.equal(stats.applied, 2);
    assert.equal(stats.responded, 1);
    assert.equal(stats.responseRate, 0.5);
  });

  it("reports no rate at all rather than zero when nothing has been applied to", () => {
    assert.equal(computeStats([app({ status: "interested" })], stages).responseRate, null);
    assert.equal(computeStats([], stages).medianDaysToResponse, null);
  });

  it("takes the median of the days from applied to first response", () => {
    const rows = [
      app({ status: "oa", events: [moved("applied", 20), moved("oa", 18)] }), // 2 days
      app({ status: "oa", events: [moved("applied", 20), moved("oa", 10)] }), // 10 days
    ];
    assert.equal(computeStats(rows, stages).medianDaysToResponse, 6, "even count averages the middle pair");

    const three = [...rows, app({ status: "oa", events: [moved("applied", 20), moved("oa", 16)] })]; // 4 days
    assert.equal(computeStats(three, stages).medianDaysToResponse, 4);
  });

  it("stops counting a response that a later demotion undid", () => {
    const row = app({ status: "applied", events: [moved("applied", 20), moved("oa", 15), moved("applied", 12)] });
    const stats = computeStats([row], stages);
    assert.equal(stats.applied, 1);
    assert.equal(stats.responded, 0);
    assert.equal(stats.responseRate, 0);
  });
});

describe("stats: the weekly funnel", () => {
  it("buckets applies and first responses into Monday-start weeks, oldest first", () => {
    const rows = [app({ status: "oa", events: [moved("applied", 3), moved("oa", 1)] })];
    const weeks = weeklyFunnel(rows, stages, 4, NOW);
    assert.equal(weeks.length, 4);
    assert.equal(
      weeks.reduce((n, w) => n + w.applied, 0),
      1,
    );
    assert.equal(
      weeks.reduce((n, w) => n + w.responses, 0),
      1,
    );
    const mondays = weeks.map((w) => new Date(`${w.weekStart}T00:00:00`).getDay());
    assert.deepEqual(mondays, [1, 1, 1, 1]);
  });

  it("drops anything older than the window", () => {
    const rows = [app({ status: "applied", events: [moved("applied", 400)] })];
    const weeks = weeklyFunnel(rows, stages, 4, NOW);
    assert.equal(
      weeks.reduce((n, w) => n + w.applied, 0),
      0,
    );
  });
});

describe("timeline: marking a stage complete", () => {
  it("offers completion only where there is something to sit for", () => {
    for (const status of ["oa", "phone_screen", "onsite"]) {
      assert.equal(isCompletableStage(app({ status }), stages), true, status);
    }
    for (const status of ["interested", "applied", "offer", "rejected", "ghosted", "withdrawn"]) {
      assert.equal(isCompletableStage(app({ status }), stages), false, status);
    }
  });

  it("round-trips the marker", () => {
    const row = app({ status: "oa", events: [moved("applied", 20), moved("oa", 10)] });
    const done = { ...row, events: withStageDone(row, stages, day(2)) };
    assert.equal(stageCompletedOn(done, stages), day(2));
    assert.equal(stageCompletedOn({ ...done, events: withoutStageDone(done, stages) }, stages), undefined);
  });

  it("ignores a marker logged before the latest move into the stage", () => {
    // Round one was finished, then the row came back to onsite for round two.
    const row = app({ status: "onsite", events: [moved("onsite", 20)] });
    const afterRoundOne = { ...row, events: withStageDone(row, stages, day(18)) };
    const backAgain = { ...afterRoundOne, events: [...afterRoundOne.events, moved("onsite", 5)] };
    assert.equal(stageCompletedOn(backAgain, stages), undefined);
  });

  it("reports nothing for a stage that cannot be completed", () => {
    const row = app({ status: "offer", events: [moved("offer", 3)] });
    assert.equal(stageCompletedOn(row, stages), undefined);
  });

  it("leaves an earlier stage's marker alone when clearing the current one", () => {
    const row = app({ status: "onsite", events: [moved("oa", 20), { date: day(19), label: "Completed: OA", status: "oa", kind: "stage_done" }, moved("onsite", 10)] });
    const done = { ...row, events: withStageDone(row, stages, day(5)) };
    const cleared = withoutStageDone(done, stages);
    assert.equal(cleared.filter((e) => e.kind === "stage_done").length, 1, "the OA marker survives");
  });
});

describe("the default stage set", () => {
  it("is the nine stages the app shipped with, in order", () => {
    assert.deepEqual(
      DEFAULT_STAGES.map((s) => s.id),
      ["interested", "applied", "oa", "phone_screen", "onsite", "offer", "rejected", "ghosted", "withdrawn"],
    );
  });

  it("assigns the phases the hardcoded stage lists used to express", () => {
    const phase = (id: string) => stages.get(id).phase;
    assert.equal(phase("interested"), "lead");
    assert.equal(phase("applied"), "waiting");
    for (const id of ["oa", "phone_screen", "onsite"]) assert.equal(phase(id), "active", id);
    assert.equal(phase("offer"), "offer");
    for (const id of ["rejected", "ghosted", "withdrawn"]) assert.equal(phase(id), "closed", id);
  });
});
