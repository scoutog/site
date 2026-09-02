import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeHealthAutoExportPayload } from "../supabase/functions/import-health-data/adapter.js";
import { createImportHandler, secureTokenEqual } from "../supabase/functions/import-health-data/handler.js";

test("parses sanitized Health Auto Export fixture", async () => {
  const payload = JSON.parse(await readFile("supabase/functions/import-health-data/fixtures/health-auto-export-sample.json", "utf8"));
  const parsed = normalizeHealthAutoExportPayload(payload);
  assert.equal(parsed.workouts.length, 1);
  assert.equal(parsed.workouts[0].duration_seconds, 1887);
  assert.equal(Math.round(parsed.workouts[0].distance_meters), 4023);
  assert.equal(parsed.workouts[0].zones.length, 5);
});

test("parses Health Auto Export v2 nested quantity shape", async () => {
  const payload = JSON.parse(await readFile("supabase/functions/import-health-data/fixtures/health-auto-export-v2-shape-sample.json", "utf8"));
  const parsed = normalizeHealthAutoExportPayload(payload);
  const workout = parsed.workouts[0];
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.workouts.length, 1);
  assert.equal(workout.source_workout_id, "sanitized-v2-running-001");
  assert.equal(Math.round(workout.distance_meters), 4034);
  assert.equal(Math.round(workout.average_heart_rate_bpm), 171);
  assert.equal(Math.round(workout.maximum_heart_rate_bpm), 206);
  assert.equal(workout.zones.length, 5);
  assert.ok(workout.intervals.some((interval) => interval.interval_type === "work"));
  assert.ok(workout.intervals.some((interval) => interval.interval_type === "recovery"));
  assert.equal(workout.recovery.one_minute_heart_rate_bpm, 155);
});

test("derives exact mile splits from minute distance samples", () => {
  const parsed = normalizeHealthAutoExportPayload({
    data: {
      workouts: [{
        id: "split-test",
        name: "Outdoor Run",
        start: "2026-09-02 09:00:00 -0400",
        duration: 1800,
        distance: { qty: 2.4, units: "mi" },
        heartRate: { avg: { qty: 160, units: "count/min" } },
        heartRateData: [
          { Avg: 150, date: "2026-09-02 09:00:00 -0400" },
          { Avg: 160, date: "2026-09-02 09:10:00 -0400" },
          { Avg: 170, date: "2026-09-02 09:20:00 -0400" }
        ],
        walkingAndRunningDistance: [
          { qty: 0.5, units: "mi" },
          { qty: 0.6, units: "mi" },
          { qty: 0.9, units: "mi" },
          { qty: 0.4, units: "mi" }
        ]
      }]
    }
  });
  const splits = parsed.workouts[0].splits;
  assert.equal(splits.length, 3);
  assert.equal(Math.round(splits[0].distance_meters), 1609);
  assert.equal(Math.round(splits[1].distance_meters), 1609);
  assert.equal(Math.round(splits[2].distance_meters), 644);
});

test("rejects missing and invalid bearer tokens", async () => {
  const handler = createImportHandler({
    env: { RUNNING_INGESTION_SECRET: "secret", RUNNING_USER_ID: "user-1" },
    supabaseFactory: fakeSupabaseFactory()
  });
  const missing = await handler(new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  assert.equal(missing.status, 401);
  const invalid = await handler(new Request("https://example.com", { method: "POST", headers: { authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" }));
  assert.equal(invalid.status, 401);
  assert.equal(secureTokenEqual("secret", "secret"), true);
  assert.equal(secureTokenEqual("secret", "nope"), false);
});

test("rejects malformed payloads and wrong content type", async () => {
  const handler = createImportHandler({
    env: { RUNNING_INGESTION_SECRET: "secret", RUNNING_USER_ID: "user-1" },
    supabaseFactory: fakeSupabaseFactory()
  });
  const wrongType = await handler(new Request("https://example.com", { method: "POST", headers: { authorization: "Bearer secret", "content-type": "text/plain" }, body: "{}" }));
  assert.equal(wrongType.status, 415);
  const malformed = await handler(new Request("https://example.com", { method: "POST", headers: { authorization: "Bearer secret", "content-type": "application/json" }, body: "{" }));
  assert.equal(malformed.status, 400);
});

test("upserts duplicate imports and workouts idempotently", async () => {
  const calls = [];
  const handler = createImportHandler({
    env: { RUNNING_INGESTION_SECRET: "secret", RUNNING_USER_ID: "user-1" },
    hashPayload: async () => "same-hash",
    supabaseFactory: fakeSupabaseFactory(calls)
  });
  const payload = JSON.stringify({
    workouts: [{ uuid: "stable-id", workoutActivityType: "Running", startDate: "2026-08-30T10:00:00Z", duration: "10:00", distance: "1 mi" }]
  });
  const request = () => new Request("https://example.com", {
    method: "POST",
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: payload
  });
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  const rawUpserts = calls.filter((call) => call.table === "raw_imports" && call.action === "upsert");
  const workoutUpserts = calls.filter((call) => call.table === "workouts" && call.action === "upsert");
  assert.equal(rawUpserts.length, 2);
  assert.equal(workoutUpserts.length, 2);
  assert.equal(rawUpserts[0].options.onConflict, "user_id,payload_hash");
  assert.equal(workoutUpserts[0].options.onConflict, "user_id,source,source_workout_id");
});

test("migration enables RLS ownership policies", async () => {
  const sql = await readFile("supabase/migrations/202609020001_running_dashboard.sql", "utf8");
  for (const table of ["profiles", "running_private_users", "raw_imports", "workouts", "workout_splits", "workout_intervals", "heart_rate_zones", "heart_rate_recovery", "goals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /running_is_private_user\(auth\.uid\(\)\)/);
  assert.match(sql, /exists \(\s*select 1 from public\.workouts w where w\.id = workout_id and w\.user_id = auth\.uid\(\)/);
});

function fakeSupabaseFactory(calls = []) {
  return () => ({
    from(table) {
      return {
        upsert(row, options = {}) {
          calls.push({ table, action: "upsert", row, options });
          return {
            select() {
              return {
                async single() {
                  return { data: { id: table === "raw_imports" ? "import-id" : "workout-id" }, error: null };
                }
              };
            }
          };
        },
        delete() {
          calls.push({ table, action: "delete" });
          return { async eq() { return { error: null }; } };
        },
        insert(rows) {
          calls.push({ table, action: "insert", rows });
          return Promise.resolve({ data: rows, error: null });
        },
        update(row) {
          calls.push({ table, action: "update", row });
          return { async eq() { return { error: null }; } };
        }
      };
    }
  });
}
