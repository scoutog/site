import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCoachContext } from "../supabase/functions/running-coach/coach-context.js";
import { createCoachHandler, extractResponseText, parseJwtClaims } from "../supabase/functions/running-coach/handler.js";

const userId = "0a9fd9fe-1514-4349-8ac1-797f239b22c3";
const workoutId = "11111111-1111-4111-8111-111111111111";

test("coach context includes recent interval pace summaries and selected workout detail", () => {
  const context = buildCoachContext(sampleContextInput({ selectedWorkoutId: workoutId }));
  assert.equal(context.recentWorkouts.length, 1);
  assert.equal(context.recentWorkouts[0].intervals.running.count, 2);
  assert.equal(context.recentWorkouts[0].intervals.walking.count, 1);
  assert.equal(context.intervalPaceTrends[0].runningPaceSecondsPerUnit, 600);
  assert.equal(context.selectedWorkout.id, workoutId);
  assert.equal(context.selectedWorkout.intervals[0].averagePaceSecondsPerUnit, 600);
});

test("coach context excludes raw imports, tokens, passwords, and route fields", () => {
  const contextText = JSON.stringify(buildCoachContext(sampleContextInput({ selectedWorkoutId: workoutId }))).toLowerCase();
  for (const forbidden of ["raw_imports", "payload", "authorization", "bearer", "token", "password", "route", "gps"]) {
    assert.equal(contextText.includes(forbidden), false, `context should not include ${forbidden}`);
  }
});

test("coach context handles empty workout history", () => {
  const context = buildCoachContext({ workouts: [], messages: [], unit: "mi" });
  assert.equal(context.allTime.workoutCount, 0);
  assert.deepEqual(context.recentWorkouts, []);
  assert.equal(context.selectedWorkout, null);
});

test("running coach migration enables RLS ownership policies", async () => {
  const sql = await readFile("supabase/migrations/202609040001_running_coach.sql", "utf8");
  for (const table of ["coach_messages", "coach_memory"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /running_is_private_user\(auth\.uid\(\)\)/);
  assert.match(sql, /exists \(\s*select 1\s+from public\.workouts w\s+where w\.id = workout_id\s+and w\.user_id = auth\.uid\(\)/);
});

test("running coach rejects unauthenticated requests", async () => {
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: () => fakeSupabase(),
    openAIResponder: async () => "unused"
  });
  const response = await handler(new Request("https://example.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" })
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Coach is unavailable right now.", code: "auth_missing_or_invalid_token" });
});

test("running coach rejects another user's workout id", async () => {
  let called = false;
  const state = sampleState();
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: () => fakeSupabase(state),
    openAIResponder: async () => {
      called = true;
      return "unused";
    }
  });
  const response = await authedCoachRequest(handler, { message: "what about this run?", workoutId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("running coach rejects malformed JSON with a generic error", async () => {
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: () => fakeSupabase(),
    openAIResponder: async () => "unused"
  });
  const response = await handler(new Request("https://example.com", {
    method: "POST",
    headers: {
      authorization: `Bearer ${fakeJwt()}`,
      "content-type": "application/json"
    },
    body: "{"
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Coach is unavailable right now." });
});

test("running coach accepts session token from custom header", async () => {
  let forwardedAuthorization = "";
  let getUserToken = "";
  const jwt = fakeJwt();
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: (authorization) => {
      forwardedAuthorization = authorization;
      return fakeSupabase(sampleState(), {
        onGetUser(token) {
          getUserToken = token;
        }
      });
    },
    openAIResponder: async () => "Use the interval chart and compare HR drift."
  });
  const response = await handler(new Request("https://example.com", {
    method: "POST",
    headers: {
      authorization: "Bearer publishable-key",
      apikey: "publishable-key",
      "x-running-access-token": jwt,
      "content-type": "application/json"
    },
    body: JSON.stringify({ message: "What should I watch?" })
  }));
  assert.equal(response.status, 200);
  assert.equal(forwardedAuthorization, `Bearer ${jwt}`);
  assert.equal(getUserToken, "");
});

test("running coach stores user and assistant messages", async () => {
  const state = sampleState();
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: () => fakeSupabase(state),
    openAIResponder: async ({ context }) => {
      assert.equal(context.selectedWorkout.id, workoutId);
      return "Your interval pace is steady; watch HR drift next run.";
    }
  });
  const response = await authedCoachRequest(handler, { message: "How did this interval run look?", workoutId });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.answer, /interval pace/i);
  assert.equal(state.coach_messages.length, 2);
  assert.equal(state.coach_messages[0].role, "user");
  assert.equal(state.coach_messages[1].role, "assistant");
  assert.equal(state.coach_memory.length, 1);
});

test("parses Supabase JWT claims without exposing token contents", () => {
  const claims = parseJwtClaims(fakeJwt(), "https://example.supabase.co");
  assert.equal(claims.sub, userId);
  assert.equal(claims.role, "authenticated");
  assert.equal(parseJwtClaims("not-a-jwt", "https://example.supabase.co"), null);
});

test("running coach returns a generic error when the model fails", async () => {
  const state = sampleState();
  const handler = createCoachHandler({
    env: { SUPABASE_URL: "https://example.supabase.co" },
    supabaseFactory: () => fakeSupabase(state),
    openAIResponder: async () => {
      throw new Error("model exploded with details");
    }
  });
  const response = await authedCoachRequest(handler, { message: "What changed?" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Coach is unavailable right now.", code: "unexpected_error" });
});

test("extracts text from OpenAI Responses API shapes", () => {
  assert.equal(extractResponseText({ output_text: "hello" }), "hello");
  assert.equal(extractResponseText({ output: [{ content: [{ type: "output_text", text: "hi" }] }] }), "hi");
});

async function authedCoachRequest(handler, body) {
  return handler(new Request("https://example.com", {
    method: "POST",
    headers: {
      authorization: `Bearer ${fakeJwt()}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  }));
}

function sampleContextInput({ selectedWorkoutId = null } = {}) {
  return {
    profile: { preferred_distance_unit: "mi", minimum_counted_workout_seconds: 600, timezone: "America/New_York" },
    workouts: [{
      id: workoutId,
      user_id: userId,
      workout_type: "running",
      started_at: "2026-09-02T17:30:00Z",
      duration_seconds: 1800,
      distance_meters: 4828.032,
      average_heart_rate_bpm: 170.2,
      maximum_heart_rate_bpm: 188.4,
      notes: "Felt controlled."
    }],
    intervals: [
      { workout_id: workoutId, interval_number: 1, interval_type: "work", distance_meters: 160.9344, duration_seconds: 60, average_heart_rate_bpm: 160 },
      { workout_id: workoutId, interval_number: 2, interval_type: "recovery", distance_meters: 80.4672, duration_seconds: 60, average_heart_rate_bpm: 150 },
      { workout_id: workoutId, interval_number: 3, interval_type: "work", distance_meters: 160.9344, duration_seconds: 60, average_heart_rate_bpm: 170 }
    ],
    splits: [{ workout_id: workoutId, split_number: 1, distance_meters: 1609.344, duration_seconds: 620, average_heart_rate_bpm: 166 }],
    zones: [
      { workout_id: workoutId, zone_number: 4, lower_bound_bpm: 165, upper_bound_bpm: 179, duration_seconds: 900 },
      { workout_id: workoutId, zone_number: 5, lower_bound_bpm: 180, upper_bound_bpm: null, duration_seconds: 300 }
    ],
    recovery: [{ workout_id: workoutId, ending_heart_rate_bpm: 180, one_minute_heart_rate_bpm: 150, two_minute_heart_rate_bpm: 140 }],
    messages: [{ role: "user", content: "I usually do one minute run and one minute walk.", scope: "dashboard" }],
    memory: { summary: "User cares about interval runs.", preferences: { intervalFocus: true } },
    selectedWorkoutId,
    unit: "mi"
  };
}

function sampleState() {
  const input = sampleContextInput();
  return {
    running_private_users: [{ id: userId }],
    profiles: [{ id: userId, preferred_distance_unit: "mi", minimum_counted_workout_seconds: 600, timezone: "America/New_York" }],
    workouts: input.workouts,
    workout_intervals: input.intervals,
    workout_splits: input.splits,
    heart_rate_zones: input.zones,
    heart_rate_recovery: input.recovery,
    coach_messages: [],
    coach_memory: []
  };
}

function fakeJwt() {
  const header = base64Url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: userId,
    role: "authenticated",
    iss: "https://example.supabase.co/auth/v1",
    exp: Math.floor(Date.now() / 1000) + 3600
  }));
  return `${header}.${payload}.signature`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fakeSupabase(state = sampleState(), hooks = {}) {
  return {
    auth: {
      async getUser(token) {
        hooks.onGetUser?.(token);
        return { data: { user: { id: userId } }, error: null };
      }
    },
    from(table) {
      return new Query(state, table);
    }
  };
}

class Query {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.filters = [];
    this.inFilters = [];
    this.sort = null;
    this.maxRows = null;
    this.action = "select";
    this.row = null;
  }

  select() {
    this.action = "select";
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  in(field, values) {
    this.inFilters.push({ field, values });
    return this;
  }

  order(field, options = {}) {
    this.sort = { field, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.maxRows = count;
    return this;
  }

  insert(row) {
    this.action = "insert";
    this.row = row;
    return this;
  }

  upsert(row) {
    this.action = "upsert";
    this.row = row;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  maybeSingle() {
    return this.execute(true);
  }

  single() {
    return this.execute(true);
  }

  then(resolve, reject) {
    return this.execute(false).then(resolve, reject);
  }

  async execute(single = false) {
    if (this.action === "insert") {
      const rows = Array.isArray(this.row) ? this.row : [this.row];
      this.state[this.table].push(...rows.map((row) => ({ id: row.id || `${this.table}-${this.state[this.table].length + 1}`, created_at: row.created_at || new Date().toISOString(), ...row })));
      return { data: rows, error: null };
    }
    if (this.action === "upsert") {
      const index = this.state[this.table].findIndex((row) => row.user_id === this.row.user_id || row.id === this.row.id);
      if (index >= 0) this.state[this.table][index] = { ...this.state[this.table][index], ...this.row };
      else this.state[this.table].push({ ...this.row });
      return { data: this.row, error: null };
    }
    if (this.action === "delete") {
      this.state[this.table] = this.state[this.table].filter((row) => !matches(row, this.filters, this.inFilters));
      return { data: null, error: null };
    }

    let rows = [...(this.state[this.table] || [])].filter((row) => matches(row, this.filters, this.inFilters));
    if (this.sort) {
      rows.sort((a, b) => {
        const left = a[this.sort.field];
        const right = b[this.sort.field];
        return this.sort.ascending ? String(left).localeCompare(String(right)) : String(right).localeCompare(String(left));
      });
    }
    if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
    return { data: single ? rows[0] || null : rows, error: null };
  }
}

function matches(row, filters, inFilters) {
  return filters.every((filter) => row[filter.field] === filter.value) &&
    inFilters.every((filter) => filter.values.includes(row[filter.field]));
}
