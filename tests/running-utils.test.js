import test from "node:test";
import assert from "node:assert/strict";
import {
  consistencyStreak,
  formatDuration,
  formatPace,
  goalProgress,
  metersToMiles,
  paceVersusHeartRateTrend,
  rollingAverages,
  secondsPerMile,
  selectComparableWorkout,
  startOfWeek,
  weeklyAggregation,
  workRecoveryRatio,
  qualifyWorkout,
  zonePercentages
} from "../running-utils.js";

test("pace and unit conversion", () => {
  assert.equal(Math.round(metersToMiles(1609.344) * 100) / 100, 1);
  assert.equal(Math.round(secondsPerMile(3218.688, 1500)), 750);
  assert.equal(formatPace(755, "mi"), "12:35 / mi");
});

test("duration formatting", () => {
  assert.equal(formatDuration(1887), "31:27");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(Number.NaN), "Missing");
});

test("heart-rate-zone percentages", () => {
  const zones = zonePercentages([{ zone_number: 1, duration_seconds: 30 }, { zone_number: 2, duration_seconds: 90 }]);
  assert.equal(zones[0].percentage, 0.25);
  assert.equal(zones[1].percentage, 0.75);
});

test("weekly aggregation and goal progress", () => {
  const workouts = [
    { started_at: "2026-08-17T12:00:00Z", duration_seconds: 700, distance_meters: 1600 },
    { started_at: "2026-08-18T12:00:00Z", duration_seconds: 500, distance_meters: 1600 },
    { started_at: "2026-08-24T12:00:00Z", duration_seconds: 800, distance_meters: 3200 }
  ];
  assert.equal(startOfWeek(new Date("2026-09-02T12:00:00Z"), "UTC"), "2026-08-31");
  const weekly = weeklyAggregation(workouts, { timezone: "UTC", minimumSeconds: 600 });
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].week, "2026-08-17");
  assert.equal(weekly[0].count, 1);
  const progress = goalProgress(workouts, { targetRuns: 2, goalDays: 28, minimumSeconds: 600, now: "2026-08-25T12:00:00Z" });
  assert.equal(progress.completed, 2);
  assert.equal(progress.percentage, 100);
});

test("streak calculation", () => {
  const workouts = [
    { started_at: "2026-08-17T12:00:00Z", duration_seconds: 700 },
    { started_at: "2026-08-24T12:00:00Z", duration_seconds: 700 },
    { started_at: "2026-08-31T12:00:00Z", duration_seconds: 700 }
  ];
  assert.equal(consistencyStreak(workouts, { timezone: "UTC", minimumSeconds: 600, now: "2026-09-02T12:00:00Z" }), 3);
});

test("rolling averages", () => {
  const rows = rollingAverages([{ value: 2 }, { value: 4 }, { value: 6 }, { value: 10 }], ["value"], 3);
  assert.equal(rows[0].value_rolling_3, 2);
  assert.equal(rows[2].value_rolling_3, 4);
  assert.equal(rows[3].value_rolling_3, 20 / 3);
});

test("comparable-workout logic rejects different workouts", () => {
  const target = { id: "c", started_at: "2026-08-20T12:00:00Z", duration_seconds: 1800, distance_meters: 4000 };
  const comparable = { id: "b", started_at: "2026-08-19T12:00:00Z", duration_seconds: 1750, distance_meters: 3900 };
  const tooDifferent = { id: "a", started_at: "2026-08-18T12:00:00Z", duration_seconds: 3600, distance_meters: 10000 };
  assert.equal(selectComparableWorkout(target, [tooDifferent, comparable, target]), comparable);
});

test("work/recovery ratio", () => {
  const ratio = workRecoveryRatio([
    { interval_type: "work", duration_seconds: 60 },
    { interval_type: "work", duration_seconds: 60 },
    { interval_type: "recovery", duration_seconds: 60 }
  ]);
  assert.equal(ratio.label, "2:1");
  assert.equal(ratio.ratio, 2);
});

test("workout qualification and pace-versus-HR trend", () => {
  assert.equal(qualifyWorkout({ duration_seconds: 599 }, 600), false);
  assert.equal(qualifyWorkout({ duration_seconds: 600 }, 600), true);
  const trend = paceVersusHeartRateTrend([
    { started_at: "2026-08-01", distance_meters: 1609.344, duration_seconds: 600, average_heart_rate_bpm: 160 },
    { started_at: "2026-08-02", distance_meters: 1609.344, duration_seconds: 620, average_heart_rate_bpm: 163 },
    { started_at: "2026-08-03", distance_meters: 1609.344, duration_seconds: 640, average_heart_rate_bpm: 166 }
  ]);
  assert.equal(trend.supported, true);
  assert.ok(trend.slope > 0);
});
