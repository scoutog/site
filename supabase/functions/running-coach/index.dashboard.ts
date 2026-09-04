import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 20_000;
const MAX_QUESTION_CHARS = 2000;
const GENERIC_ERROR = "Coach is unavailable right now.";
const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;
const RECENT_WORKOUT_LIMIT = 12;
const DETAIL_INTERVAL_LIMIT = 80;
const MESSAGE_LIMIT = 12;
const MAX_MESSAGE_CHARS = 1200;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-running-access-token",
  "access-control-max-age": "86400"
};

serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authorization = request.headers.get("authorization") || "";
    const sessionToken = request.headers.get("x-running-access-token") || "";
    const userAuthorization = sessionToken ? `Bearer ${sessionToken}` : authorization;
    const userToken = userAuthorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!userAuthorization.match(/^Bearer\s+[-_A-Za-z0-9.]+$/)) {
      return json({ error: GENERIC_ERROR, code: "auth_missing_or_invalid_token" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: GENERIC_ERROR }, 415);
    }

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: GENERIC_ERROR }, 413);
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
      return json({ error: GENERIC_ERROR }, 413);
    }

    let body;
    try {
      body = JSON.parse(bodyText || "{}");
    } catch (_error) {
      return json({ error: GENERIC_ERROR }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getPublicSupabaseKey(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            authorization: userAuthorization,
            "x-application-name": "scout-running-coach"
          }
        }
      }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(userToken);
    const user = userData?.user;
    if (userError || !user?.id) {
      return json({ error: GENERIC_ERROR, code: "auth_session_not_verified" }, 401);
    }

    const privateUser = await single(supabase.from("running_private_users").select("id").eq("id", user.id));
    if (!privateUser.data) {
      return json({ error: GENERIC_ERROR, code: "auth_user_not_allowed" }, 403);
    }

    if (body.action === "clear") {
      await supabase.from("coach_messages").delete().eq("user_id", user.id);
      await supabase.from("coach_memory").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    const question = String(body.message || "").trim();
    const workoutId = typeof body.workoutId === "string" && body.workoutId.trim() ? body.workoutId.trim() : null;
    const scope = workoutId || body.scope === "workout" ? "workout" : "dashboard";
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return json({ error: GENERIC_ERROR }, 400);
    }

    const data = await loadCoachData(supabase, user.id);
    if (workoutId && !data.workouts.some((workout) => workout.id === workoutId)) {
      return json({ error: GENERIC_ERROR }, 404);
    }

    const insertUser = await supabase.from("coach_messages").insert({
      user_id: user.id,
      workout_id: workoutId,
      scope,
      role: "user",
      content: question
    });
    if (insertUser.error) throw new Error("message_insert_failed");

    const context = buildCoachContext({
      profile: data.profile,
      workouts: data.workouts,
      splits: data.splits,
      intervals: data.intervals,
      zones: data.zones,
      recovery: data.recovery,
      messages: data.messages,
      memory: data.memory,
      selectedWorkoutId: workoutId,
      unit: data.profile?.preferred_distance_unit || "mi",
      minimumSeconds: Number(data.profile?.minimum_counted_workout_seconds || 600),
      timezone: data.profile?.timezone || "America/New_York"
    });

    const answer = await askOpenAI(question, context);
    const cleanAnswer = String(answer || "").trim().slice(0, 8000);
    if (!cleanAnswer) throw new Error("empty_model_response");

    const insertAssistant = await supabase.from("coach_messages").insert({
      user_id: user.id,
      workout_id: workoutId,
      scope,
      role: "assistant",
      content: cleanAnswer
    });
    if (insertAssistant.error) throw new Error("assistant_insert_failed");

    await rememberConversation(supabase, user.id, data.memory, data.messages, question, workoutId);
    return json({ answer: cleanAnswer });
  } catch (error) {
    console.error("running_coach_error", safeErrorCode(error));
    return json({ error: GENERIC_ERROR }, 500);
  }
});

async function loadCoachData(supabase, userId) {
  const profileResult = await single(supabase.from("profiles").select("*").eq("id", userId));
  const workoutResult = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("workout_type", "running")
    .order("started_at", { ascending: true })
    .limit(240);
  if (workoutResult.error) throw new Error("workout_load_failed");

  const workouts = workoutResult.data || [];
  const workoutIds = workouts.map((workout) => workout.id);
  const [splitsResult, intervalsResult, zonesResult, recoveryResult, messagesResult, memoryResult] = await Promise.all([
    workoutIds.length ? supabase.from("workout_splits").select("*").in("workout_id", workoutIds).order("split_number") : { data: [] },
    workoutIds.length ? supabase.from("workout_intervals").select("*").in("workout_id", workoutIds).order("interval_number") : { data: [] },
    workoutIds.length ? supabase.from("heart_rate_zones").select("*").in("workout_id", workoutIds).order("zone_number") : { data: [] },
    workoutIds.length ? supabase.from("heart_rate_recovery").select("*").in("workout_id", workoutIds) : { data: [] },
    supabase.from("coach_messages").select("role,scope,workout_id,content,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
    single(supabase.from("coach_memory").select("*").eq("user_id", userId))
  ]);

  for (const result of [splitsResult, intervalsResult, zonesResult, recoveryResult, messagesResult]) {
    if (result.error) throw new Error("coach_data_load_failed");
  }

  return {
    profile: profileResult.data || null,
    workouts,
    splits: splitsResult.data || [],
    intervals: intervalsResult.data || [],
    zones: zonesResult.data || [],
    recovery: recoveryResult.data || [],
    messages: (messagesResult.data || []).slice().reverse(),
    memory: memoryResult.data || null
  };
}

async function askOpenAI(question, context) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("openai_not_configured");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
      instructions: [
        "You are a running coach for one private dashboard.",
        "Use the supplied workout summaries and prior coach conversation only.",
        "Prioritize consistency, cardiovascular efficiency, sustainable interval progress, and lower excessive high-intensity time over fastest pace.",
        "Frame observations as training trends. Do not provide medical advice, diagnoses, or treatment recommendations.",
        "If data is missing or insufficient, say that plainly. Do not invent workout data.",
        "Keep responses concise, practical, and specific to the numbers in context."
      ].join(" "),
      input: `Question: ${question}\n\nPrivate dashboard context JSON:\n${JSON.stringify(context)}`,
      max_output_tokens: 650
    })
  });
  if (!response.ok) throw new Error(`openai_request_failed_${response.status}`);
  const data = await response.json();
  return extractResponseText(data);
}

function buildCoachContext({
  profile = {},
  workouts = [],
  splits = [],
  intervals = [],
  zones = [],
  recovery = [],
  messages = [],
  memory = null,
  selectedWorkoutId = null,
  unit = "mi",
  minimumSeconds = 600,
  timezone = "America/New_York"
} = {}) {
  const cleanUnit = unit === "km" ? "km" : "mi";
  const sorted = workouts
    .filter((workout) => workout && workout.workout_type === "running")
    .slice()
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  const intervalsByWorkout = groupByWorkout(intervals);
  const zonesByWorkout = groupByWorkout(zones);
  const splitsByWorkout = groupByWorkout(splits);
  const recoveryByWorkout = recovery.reduce((map, row) => {
    if (row?.workout_id) map.set(row.workout_id, row);
    return map;
  }, new Map());
  const selectedWorkout = selectedWorkoutId
    ? sorted.find((workout) => workout.id === selectedWorkoutId)
    : null;

  return {
    purpose: "Personal running coach context. Treat these as training trends, not medical guidance.",
    preferences: {
      timezone,
      distanceUnit: cleanUnit,
      minimumCountedWorkoutSeconds: toNumber(profile.minimum_counted_workout_seconds) ?? minimumSeconds,
      remembered: sanitizeMemory(memory)
    },
    allTime: summarizeAllTime(sorted, zonesByWorkout, cleanUnit, minimumSeconds),
    recentWorkouts: sorted.slice(-RECENT_WORKOUT_LIMIT).reverse().map((workout) => summarizeWorkout(
      workout,
      intervalsByWorkout.get(workout.id) || [],
      zonesByWorkout.get(workout.id) || [],
      recoveryByWorkout.get(workout.id),
      cleanUnit
    )),
    intervalPaceTrends: sorted.slice(-RECENT_WORKOUT_LIMIT).map((workout) => {
      const rows = intervalsByWorkout.get(workout.id) || [];
      return {
        workoutId: workout.id,
        date: dateOnly(workout.started_at),
        runningPaceSecondsPerUnit: intervalPaceSeconds(rows, "work", cleanUnit),
        walkingPaceSecondsPerUnit: intervalPaceSeconds(rows, "recovery", cleanUnit),
        runningAverageHeartRateBpm: roundedAverage(rows.filter((row) => row.interval_type === "work").map((row) => row.average_heart_rate_bpm)),
        walkingAverageHeartRateBpm: roundedAverage(rows.filter((row) => row.interval_type === "recovery").map((row) => row.average_heart_rate_bpm))
      };
    }),
    selectedWorkout: selectedWorkout ? workoutDetail(
      selectedWorkout,
      splitsByWorkout.get(selectedWorkout.id) || [],
      intervalsByWorkout.get(selectedWorkout.id) || [],
      zonesByWorkout.get(selectedWorkout.id) || [],
      recoveryByWorkout.get(selectedWorkout.id),
      cleanUnit
    ) : null,
    priorCoachConversation: messages
      .slice(-MESSAGE_LIMIT)
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        scope: message.scope === "workout" ? "workout" : "dashboard",
        workoutId: message.workout_id || null,
        createdAt: message.created_at,
        content: truncate(message.content || "", MAX_MESSAGE_CHARS)
      }))
  };
}

function summarizeAllTime(workouts, zonesByWorkout, unit, minimumSeconds) {
  const qualifying = workouts.filter((workout) => Number(workout.duration_seconds || 0) >= minimumSeconds);
  const totalDistanceMeters = qualifying.reduce((sum, workout) => sum + Number(workout.distance_meters || 0), 0);
  const totalDurationSeconds = qualifying.reduce((sum, workout) => sum + Number(workout.duration_seconds || 0), 0);
  const averageZone5 = average(qualifying.map((workout) => summarizeZone5(zonesByWorkout.get(workout.id) || []).percent).filter((value) => value !== null));
  return {
    workoutCount: workouts.length,
    qualifyingWorkoutCount: qualifying.length,
    firstWorkoutDate: workouts.length ? dateOnly(workouts[0].started_at) : null,
    latestWorkoutDate: workouts.length ? dateOnly(workouts.at(-1).started_at) : null,
    totalDistance: distanceValue(totalDistanceMeters, unit),
    totalDurationSeconds,
    averagePaceSecondsPerUnit: paceSeconds(totalDistanceMeters, totalDurationSeconds, unit),
    averageHeartRateBpm: roundedAverage(qualifying.map((workout) => workout.average_heart_rate_bpm)),
    averageZone5Percent: averageZone5 === null ? null : Math.round(averageZone5 * 100)
  };
}

function summarizeWorkout(workout, intervals, zones, recovery, unit) {
  const work = summarizeIntervals(intervals, "work", unit);
  const recoverySummary = summarizeIntervals(intervals, "recovery", unit);
  return {
    id: workout.id,
    date: dateOnly(workout.started_at),
    startedAt: workout.started_at,
    distance: distanceValue(workout.distance_meters, unit),
    durationSeconds: toNumber(workout.duration_seconds),
    averagePaceSecondsPerUnit: paceSeconds(workout.distance_meters, workout.duration_seconds, unit),
    averageHeartRateBpm: roundOrNull(workout.average_heart_rate_bpm),
    maximumHeartRateBpm: roundOrNull(workout.maximum_heart_rate_bpm),
    zone5: summarizeZone5(zones),
    intervals: {
      running: work,
      walking: recoverySummary,
      workToRecoveryRatio: work.durationSeconds && recoverySummary.durationSeconds
        ? round(work.durationSeconds / recoverySummary.durationSeconds, 2)
        : null
    },
    heartRateRecovery: summarizeRecovery(recovery)
  };
}

function workoutDetail(workout, splits, intervals, zones, recovery, unit) {
  return {
    ...summarizeWorkout(workout, intervals, zones, recovery, unit),
    notes: truncate(workout.notes || "", 1000) || null,
    splits: splits
      .slice()
      .sort((a, b) => Number(a.split_number) - Number(b.split_number))
      .map((split) => ({
        splitNumber: toNumber(split.split_number),
        distance: distanceValue(split.distance_meters, unit),
        durationSeconds: toNumber(split.duration_seconds),
        averagePaceSecondsPerUnit: paceSeconds(split.distance_meters, split.duration_seconds, unit),
        averageHeartRateBpm: roundOrNull(split.average_heart_rate_bpm)
      })),
    intervals: intervals
      .slice()
      .sort((a, b) => Number(a.interval_number) - Number(b.interval_number))
      .slice(0, DETAIL_INTERVAL_LIMIT)
      .map((interval) => ({
        intervalNumber: toNumber(interval.interval_number),
        type: ["warmup", "work", "recovery", "cooldown"].includes(interval.interval_type) ? interval.interval_type : "unknown",
        distance: distanceValue(interval.distance_meters, unit),
        durationSeconds: toNumber(interval.duration_seconds),
        averagePaceSecondsPerUnit: paceSeconds(interval.distance_meters, interval.duration_seconds, unit),
        averageHeartRateBpm: roundOrNull(interval.average_heart_rate_bpm)
      })),
    zones: zones
      .slice()
      .sort((a, b) => Number(a.zone_number) - Number(b.zone_number))
      .map((zone) => ({
        zoneNumber: toNumber(zone.zone_number),
        lowerBoundBpm: toNumber(zone.lower_bound_bpm),
        upperBoundBpm: toNumber(zone.upper_bound_bpm),
        durationSeconds: toNumber(zone.duration_seconds)
      }))
  };
}

function summarizeIntervals(intervals, type, unit) {
  const rows = intervals.filter((interval) => interval.interval_type === type);
  const distanceMeters = rows.reduce((sum, row) => sum + Number(row.distance_meters || 0), 0);
  const durationSeconds = rows.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
  return {
    count: rows.length,
    distance: distanceValue(distanceMeters, unit),
    durationSeconds,
    averagePaceSecondsPerUnit: paceSeconds(distanceMeters, durationSeconds, unit),
    averageHeartRateBpm: roundedAverage(rows.map((row) => row.average_heart_rate_bpm))
  };
}

function summarizeZone5(zones) {
  const total = zones.reduce((sum, zone) => sum + Number(zone.duration_seconds || 0), 0);
  const zone5 = zones.find((zone) => Number(zone.zone_number) === 5);
  const seconds = toNumber(zone5?.duration_seconds);
  return {
    durationSeconds: seconds,
    percent: seconds !== null && total ? round(seconds / total, 3) : null
  };
}

function summarizeRecovery(recovery) {
  if (!recovery) return null;
  const ending = toNumber(recovery.ending_heart_rate_bpm);
  const one = toNumber(recovery.one_minute_heart_rate_bpm);
  const two = toNumber(recovery.two_minute_heart_rate_bpm);
  return {
    endingHeartRateBpm: roundOrNull(ending),
    oneMinuteHeartRateBpm: roundOrNull(one),
    twoMinuteHeartRateBpm: roundOrNull(two),
    oneMinuteDropBpm: ending !== null && one !== null ? Math.round(ending - one) : null,
    twoMinuteDropBpm: ending !== null && two !== null ? Math.round(ending - two) : null
  };
}

async function rememberConversation(supabase, userId, memory, priorMessages, question, workoutId) {
  const recentQuestions = priorMessages
    .filter((message) => message.role === "user")
    .slice(-4)
    .map((message) => message.content);
  recentQuestions.push(question);
  const summary = `Recent coach questions: ${recentQuestions.map((item) => `"${truncate(item, 120)}"`).join(", ")}`.slice(0, 1200);
  const preferences = {
    ...(memory?.preferences && typeof memory.preferences === "object" ? memory.preferences : {}),
    lastAskedAt: new Date().toISOString(),
    lastWorkoutId: workoutId,
    intervalFocus: /interval|run.walk|walk|recovery|work/i.test(question) || Boolean(memory?.preferences?.intervalFocus)
  };
  await supabase.from("coach_memory").upsert({
    user_id: userId,
    summary,
    preferences
  }, { onConflict: "user_id" });
}

function sanitizeMemory(memory) {
  return {
    summary: truncate(memory?.summary || "", 1200),
    preferences: memory?.preferences && typeof memory.preferences === "object" ? memory.preferences : {}
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      if (content.type === "text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function single(query) {
  if (typeof query.maybeSingle === "function") return query.maybeSingle();
  if (typeof query.single === "function") return query.single();
  return query;
}

function groupByWorkout(rows) {
  return rows.reduce((map, row) => {
    if (!row?.workout_id) return map;
    if (!map.has(row.workout_id)) map.set(row.workout_id, []);
    map.get(row.workout_id).push(row);
    return map;
  }, new Map());
}

function intervalPaceSeconds(intervals, type, unit) {
  const rows = intervals.filter((interval) => interval.interval_type === type);
  const meters = rows.reduce((sum, interval) => sum + Number(interval.distance_meters || 0), 0);
  const seconds = rows.reduce((sum, interval) => sum + Number(interval.duration_seconds || 0), 0);
  return paceSeconds(meters, seconds, unit);
}

function paceSeconds(meters, seconds, unit) {
  const distance = toNumber(meters);
  const duration = toNumber(seconds);
  if (!distance || !duration) return null;
  const divisor = unit === "km" ? METERS_PER_KM : METERS_PER_MILE;
  return Math.round(duration / (distance / divisor));
}

function distanceValue(meters, unit) {
  const value = toNumber(meters);
  if (value === null) return null;
  return round(value / (unit === "km" ? METERS_PER_KM : METERS_PER_MILE), 2);
}

function roundedAverage(values) {
  const finite = values.map(toNumber).filter((value) => value !== null);
  return finite.length ? Math.round(average(finite)) : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function roundOrNull(value) {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

function truncate(value, length) {
  const text = String(value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function safeErrorCode(error) {
  const message = String(error?.message || "unknown_error").toLowerCase();
  const match = message.match(/^[a-z0-9_:-]{1,80}$/);
  return match ? match[0] : "unexpected_error";
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getPublicSupabaseKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!publishableKeys) return "";
  try {
    const parsed = JSON.parse(publishableKeys);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) return parsed[0] || "";
    if (parsed && typeof parsed === "object") {
      return Object.values(parsed).find((value) => typeof value === "string") || "";
    }
  } catch (_error) {
    return publishableKeys;
  }
  return "";
}
