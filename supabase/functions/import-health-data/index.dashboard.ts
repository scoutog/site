import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_PAYLOAD_BYTES = 1_000_000;
const METERS_PER_MILE = 1609.344;
const DEFAULT_HR_ZONES = [
  { zone: 1, lower: 0, upper: 129 },
  { zone: 2, lower: 130, upper: 149 },
  { zone: 3, lower: 150, upper: 164 },
  { zone: 4, lower: 165, upper: 179 },
  { zone: 5, lower: 180, upper: null }
];

serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!token || !secureTokenEqual(token, Deno.env.get("RUNNING_INGESTION_SECRET") || "")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Unsupported content type" }, 415);
    }

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_PAYLOAD_BYTES) return json({ error: "Payload too large" }, 413);

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_PAYLOAD_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (_error) {
      return json({ status: "failed", imported: 0, errors: ["Malformed JSON payload."] }, 400);
    }

    const userId = Deno.env.get("RUNNING_USER_ID");
    if (!userId) return json({ error: "Import target is not configured" }, 500);

    const serverKey = getServerSupabaseKey();
    if (!serverKey) return json({ status: "failed", imported: 0, errors: ["Server database key is not configured."] }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serverKey,
      { auth: { persistSession: false } }
    );

    await ensureImportProfile(supabase, userId, Deno.env.get("RUNNING_USER_EMAIL") || "running-dashboard@local.invalid");

    const payloadHash = await sha256Hex(bodyText);
    const parsed = normalizePayload(payload);
    const importStatus = parsed.errors.length && parsed.workouts.length
      ? "partially_succeeded"
      : parsed.errors.length
        ? "failed"
        : "succeeded";

    const { data: rawImport, error: rawError } = await supabase
      .from("raw_imports")
      .upsert({
        user_id: userId,
        source: "health_auto_export",
        source_identifier: String(payload.exportIdentifier || payload.export_id || payload.source || "health_auto_export"),
        payload,
        payload_hash: payloadHash,
        status: importStatus,
        error_summary: parsed.errors.map((error) => error.message).slice(0, 5).join("; ") || null
      }, { onConflict: "user_id,payload_hash" })
      .select("id")
      .single();

    if (rawError) return json({ status: "failed", imported: 0, errors: ["Unable to record import."] }, 500);

    const counts = { workouts: 0, splits: 0, intervals: 0, zones: 0, recovery: 0 };
    const upsertErrors: string[] = [];

    for (const workout of parsed.workouts) {
      try {
        const workoutId = await upsertWorkoutTree(supabase, userId, rawImport.id, workout);
        if (workoutId) {
          counts.workouts += 1;
          counts.splits += workout.splits.length;
          counts.intervals += workout.intervals.length;
          counts.zones += workout.zones.length;
          counts.recovery += workout.recovery ? 1 : 0;
        }
      } catch (_error) {
        upsertErrors.push("Workout import failed.");
      }
    }

    const errors = [...parsed.errors.map((error) => error.message), ...upsertErrors].slice(0, 8);
    const status = errors.length && counts.workouts ? "partially_succeeded" : errors.length ? "failed" : "succeeded";

    if (status !== importStatus) {
      await supabase.from("raw_imports").update({ status, error_summary: errors.join("; ") || null }).eq("id", rawImport.id);
    }

    return json({ status, imported: counts, errors });
  } catch (_error) {
    return json({ status: "failed", imported: 0, errors: ["Import failed."] }, 500);
  }
});

function getServerSupabaseKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return "";
  try {
    const parsed = JSON.parse(secretKeys);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) return parsed[0] || "";
    if (parsed && typeof parsed === "object") return Object.values(parsed).find((value) => typeof value === "string") || "";
  } catch (_error) {
    return secretKeys;
  }
  return "";
}

async function ensureImportProfile(supabase, userId: string, email: string) {
  await supabase.from("running_private_users").upsert({ id: userId }, { onConflict: "id" });
  await supabase.from("profiles").upsert({
    id: userId,
    email,
    timezone: "America/New_York",
    preferred_distance_unit: "mi",
    minimum_counted_workout_seconds: 600
  }, { onConflict: "id" });
}

async function upsertWorkoutTree(supabase, userId: string, importId: string, workout) {
  const { splits, intervals, zones, recovery, ...workoutRow } = workout;
  const { data, error } = await supabase
    .from("workouts")
    .upsert({ ...workoutRow, user_id: userId, import_id: importId }, { onConflict: "user_id,source,source_workout_id" })
    .select("id")
    .single();

  if (error) throw new Error("Unable to upsert workout.");
  const workoutId = data.id;

  await Promise.all([
    supabase.from("workout_splits").delete().eq("workout_id", workoutId),
    supabase.from("workout_intervals").delete().eq("workout_id", workoutId),
    supabase.from("heart_rate_zones").delete().eq("workout_id", workoutId),
    supabase.from("heart_rate_recovery").delete().eq("workout_id", workoutId)
  ]);

  if (splits.length) await supabase.from("workout_splits").insert(splits.map((row) => ({ ...row, workout_id: workoutId })));
  if (intervals.length) await supabase.from("workout_intervals").insert(intervals.map((row) => ({ ...row, workout_id: workoutId })));
  if (zones.length) await supabase.from("heart_rate_zones").insert(zones.map((row) => ({ ...row, workout_id: workoutId })));
  if (recovery) await supabase.from("heart_rate_recovery").insert({ ...recovery, workout_id: workoutId });

  return workoutId;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be a JSON object.");
  }

  const candidates = [
    payload.workouts,
    payload.Workouts,
    payload.activities,
    payload.data?.workouts,
    payload.data?.Workouts,
    payload.data?.activities,
    payload.records,
    payload.data
  ].filter(Boolean);

  let workoutRows = [];
  for (const value of candidates) {
    if (Array.isArray(value)) {
      workoutRows = value;
      break;
    }
  }
  if (!workoutRows.length && looksLikeWorkout(payload)) workoutRows = [payload];

  const workouts = [];
  const errors = [];
  workoutRows.forEach((row, index) => {
    try {
      const workout = normalizeWorkout(row, index);
      if (workout) workouts.push(workout);
    } catch (error) {
      errors.push({ index, message: error.message || "Unsupported workout row." });
    }
  });

  return { workouts, errors };
}

function normalizeWorkout(input, index: number) {
  const workoutType = String(pick(input, ["workout_type", "workoutType", "activityType", "workoutActivityType", "type", "name"], "running"));
  if (!/running|run|HKWorkoutActivityTypeRunning/i.test(workoutType)) return null;

  const startedAt = parseDate(pick(input, ["started_at", "startDate", "start_date", "start", "date", "Start"]));
  const endedAt = parseDate(pick(input, ["ended_at", "endDate", "end_date", "end", "End"]));
  const durationSeconds = parseDuration(pick(input, ["duration_seconds", "duration", "durationSeconds", "elapsedTime", "Duration"]));
  const distanceMeters = parseDistanceMeters(input);

  if (!startedAt) throw new Error("Running workout is missing a valid start time.");
  if (!durationSeconds) throw new Error("Running workout is missing a valid duration.");

  const workout = {
    source: String(pick(input, ["source", "sourceName", "app", "device"], "health_auto_export")),
    source_workout_id: String(pick(input, ["source_workout_id", "sourceWorkoutId", "uuid", "id", "workoutId", "externalId"], "")),
    workout_type: "running",
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    active_energy_kcal: energyKcal(pick(input, ["active_energy_kcal", "activeEnergyBurned", "activeEnergy", "activeEnergyKcal", "active_kilocalories"])),
    total_energy_kcal: energyKcal(pick(input, ["total_energy_kcal", "totalEnergy", "totalEnergyKcal", "total_kilocalories"])),
    elevation_gain_meters: distanceQuantityMeters(pick(input, ["elevation_gain_meters", "elevationUp", "elevationGain", "elevationAscended", "totalElevationGain"])),
    average_heart_rate_bpm: heartRateValue(pick(input, ["average_heart_rate_bpm", "averageHeartRate", "avgHeartRate", "avg_hr", "heartRateAverage", "heartRate"])),
    minimum_heart_rate_bpm: heartRateValue(pick(input, ["minimum_heart_rate_bpm", "minimumHeartRate", "minHeartRate", "heartRateMinimum", "heartRate"]), "min"),
    maximum_heart_rate_bpm: heartRateValue(pick(input, ["maximum_heart_rate_bpm", "maximumHeartRate", "maxHeartRate", "heartRateMaximum", "heartRate"]), "max"),
    average_speed_mps: speedMps(pick(input, ["average_speed_mps", "averageSpeed", "avgSpeed", "speed"])),
    average_power_watts: quantityNumber(pick(input, ["average_power_watts", "averagePower", "avgPower"])),
    perceived_effort: nullableString(pick(input, ["perceived_effort", "perceivedEffort", "effort"])),
    notes: nullableString(pick(input, ["notes", "note"])),
    splits: normalizeSplits(pick(input, ["splits", "Splits", "laps", "Laps"], []), input),
    intervals: normalizeIntervals(pick(input, ["intervals", "segments", "workoutIntervals"], []), input),
    zones: normalizeZones(pick(input, ["heart_rate_zones", "heartRateZones", "zones", "Heart Rate Zones"], []), input),
    recovery: normalizeRecovery(pick(input, ["heart_rate_recovery", "heartRateRecovery", "recovery"], input))
  };

  if (!workout.average_speed_mps && workout.distance_meters && workout.duration_seconds) {
    workout.average_speed_mps = workout.distance_meters / workout.duration_seconds;
  }
  if (!workout.source_workout_id) {
    workout.source_workout_id = `fallback:${[workout.source, workout.started_at, workout.duration_seconds, Math.round(Number(workout.distance_meters || 0)), Math.round(Number(workout.average_heart_rate_bpm || 0)), index].join(":")}`;
  }
  return workout;
}

function normalizeSplits(rows, workoutInput = {}) {
  if (!Array.isArray(rows) || !rows.length) return deriveSplitsFromDistanceSamples(workoutInput);
  return rows.map((row, index) => ({
    split_number: numberOrNull(pick(row, ["split_number", "splitNumber", "mile", "kilometer", "lap", "number"], index + 1)),
    distance_meters: parseDistanceMeters(row),
    duration_seconds: parseDuration(pick(row, ["duration_seconds", "duration", "durationSeconds", "elapsedTime"])),
    average_heart_rate_bpm: numberOrNull(pick(row, ["average_heart_rate_bpm", "averageHeartRate", "avgHeartRate", "avg_hr"])),
    average_power_watts: numberOrNull(pick(row, ["average_power_watts", "averagePower", "avgPower"]))
  })).filter((split) => split.duration_seconds || split.distance_meters);
}

function normalizeIntervals(rows, workoutInput = {}) {
  if (!Array.isArray(rows) || !rows.length) return deriveIntervalsFromDistanceSamples(workoutInput);
  return rows.map((row, index) => ({
    interval_number: numberOrNull(pick(row, ["interval_number", "intervalNumber", "number"], index + 1)),
    interval_type: normalizeIntervalType(pick(row, ["interval_type", "intervalType", "type", "name"], "unknown")),
    distance_meters: parseDistanceMeters(row),
    duration_seconds: parseDuration(pick(row, ["duration_seconds", "duration", "durationSeconds", "elapsedTime"])),
    average_heart_rate_bpm: numberOrNull(pick(row, ["average_heart_rate_bpm", "averageHeartRate", "avgHeartRate", "avg_hr"])),
    average_power_watts: numberOrNull(pick(row, ["average_power_watts", "averagePower", "avgPower"]))
  })).filter((interval) => interval.duration_seconds || interval.distance_meters);
}

function normalizeZones(rows, workoutInput = {}) {
  if (!Array.isArray(rows) || !rows.length) return deriveZonesFromHeartRateSamples(workoutInput);
  return rows.map((row, index) => ({
    zone_number: numberOrNull(pick(row, ["zone_number", "zoneNumber", "zone", "Zone"], index + 1)),
    lower_bound_bpm: numberOrNull(pick(row, ["lower_bound_bpm", "lowerBound", "min", "from"], 0)),
    upper_bound_bpm: numberOrNull(pick(row, ["upper_bound_bpm", "upperBound", "max", "to"], null)),
    duration_seconds: parseDuration(pick(row, ["duration_seconds", "duration", "durationSeconds", "time", "Time"]))
  })).filter((zone) => zone.zone_number && zone.duration_seconds !== null);
}

function normalizeRecovery(row) {
  if (Array.isArray(row)) return deriveRecoveryFromSamples(row);
  if (!row || typeof row !== "object") return null;
  const recovery = {
    ending_heart_rate_bpm: heartRateValue(pick(row, ["ending_heart_rate_bpm", "endingHeartRate", "endHeartRate"])),
    one_minute_heart_rate_bpm: heartRateValue(pick(row, ["one_minute_heart_rate_bpm", "oneMinuteHeartRate", "heartRateRecovery1Minute", "oneMinuteRecovery"])),
    two_minute_heart_rate_bpm: heartRateValue(pick(row, ["two_minute_heart_rate_bpm", "twoMinuteHeartRate", "heartRateRecovery2Minute", "twoMinuteRecovery"]))
  };
  return Object.values(recovery).some((value) => value !== null) ? recovery : null;
}

function looksLikeWorkout(value) {
  return Boolean(pick(value, ["workoutActivityType", "workout_type", "activityType", "type", "name"]) || pick(value, ["startDate", "start", "started_at", "date"]));
}

function normalizeIntervalType(value) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("warm")) return "warmup";
  if (clean.includes("recover") || clean.includes("walk")) return "recovery";
  if (clean.includes("cool")) return "cooldown";
  if (clean.includes("work") || clean.includes("run")) return "work";
  return "unknown";
}

function parseDistanceMeters(input) {
  const meters = distanceQuantityMeters(pick(input, ["distance_meters", "distanceMeters", "distance_m", "meters"]));
  if (meters !== null) return meters;
  const miles = quantityNumber(pick(input, ["distance_miles", "distanceMiles", "miles"]));
  if (miles !== null) return miles * METERS_PER_MILE;
  const kilometers = quantityNumber(pick(input, ["distance_kilometers", "distanceKilometers", "kilometers", "km"]));
  if (kilometers !== null) return kilometers * 1000;
  const distance = pick(input, ["distance", "Distance"]);
  if (typeof distance === "string") {
    const match = distance.match(/([\d.]+)\s*(mi|mile|miles|km|kilometer|kilometers|m|meter|meters)?/i);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = (match[2] || "m").toLowerCase();
    if (unit.startsWith("mi")) return value * METERS_PER_MILE;
    if (unit.startsWith("km") || unit.startsWith("kilometer")) return value * 1000;
    return value;
  }
  return distanceQuantityMeters(distance) ?? distanceQuantityMeters(input);
}

function parseDuration(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.round(value);
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const parts = text.split(":").map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  const h = Number(text.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0);
  const m = Number(text.match(/(\d+(?:\.\d+)?)\s*m/i)?.[1] || 0);
  const s = Number(text.match(/(\d+(?:\.\d+)?)\s*s/i)?.[1] || 0);
  const seconds = h * 3600 + m * 60 + s;
  return seconds ? Math.round(seconds) : null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function pick(object, keys, fallback = null) {
  if (!object || typeof object !== "object") return fallback;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== "") {
      return object[key];
    }
  }
  return fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) return quantityNumber(value);
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function quantityNumber(value, nestedKey = "qty") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const values = value.map((entry) => quantityNumber(entry)).filter(Number.isFinite);
    return values.length ? values.reduce((sum, entry) => sum + entry, 0) : null;
  }
  if (typeof value === "object") {
    if (value[nestedKey] !== undefined) return quantityNumber(value[nestedKey]);
    if (value.avg !== undefined) return quantityNumber(value.avg);
    if (value.Avg !== undefined) return quantityNumber(value.Avg);
  }
  return numberOrNull(value);
}

function heartRateValue(value, key = "avg") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (value[key] !== undefined) return quantityNumber(value[key]);
    if (value[key.toUpperCase()] !== undefined) return quantityNumber(value[key.toUpperCase()]);
  }
  return quantityNumber(value);
}

function energyKcal(value) {
  return quantityNumber(value);
}

function speedMps(value) {
  const speed = quantityNumber(value);
  if (speed === null) return null;
  const units = typeof value === "object" ? String(value.units || "").toLowerCase() : "";
  if (units.includes("mi/hr") || units.includes("mph")) return speed * METERS_PER_MILE / 3600;
  if (units.includes("km/hr") || units.includes("km/h")) return speed * 1000 / 3600;
  return speed;
}

function distanceQuantityMeters(value) {
  const distance = quantityNumber(value);
  if (distance === null) return null;
  const units = typeof value === "object" ? String(value.units || "").toLowerCase() : "";
  if (units === "mi" || units.includes("mile")) return distance * METERS_PER_MILE;
  if (units === "km" || units.includes("kilometer")) return distance * 1000;
  if (units === "ft" || units.includes("foot") || units.includes("feet")) return distance * 0.3048;
  return distance;
}

function deriveZonesFromHeartRateSamples(workoutInput) {
  const samples = Array.isArray(workoutInput.heartRateData) ? workoutInput.heartRateData : [];
  if (!samples.length) return [];
  return DEFAULT_HR_ZONES.map((zone) => ({
    zone_number: zone.zone,
    lower_bound_bpm: zone.lower,
    upper_bound_bpm: zone.upper,
    duration_seconds: samples.filter((sample) => inZone(heartRateValue(sample), zone)).length * 60
  }));
}

function inZone(value, zone) {
  if (!Number.isFinite(value)) return false;
  return value >= zone.lower && (zone.upper === null || value <= zone.upper);
}

function deriveRecoveryFromSamples(samples) {
  if (!samples.length) return null;
  const first = samples[0];
  const firstTime = new Date(first.date).getTime();
  const oneMinute = closestSample(samples, firstTime + 60000);
  const twoMinute = closestSample(samples, firstTime + 120000);
  return {
    ending_heart_rate_bpm: heartRateValue(first),
    one_minute_heart_rate_bpm: heartRateValue(oneMinute),
    two_minute_heart_rate_bpm: heartRateValue(twoMinute)
  };
}

function closestSample(samples, targetTime) {
  return samples
    .filter((sample) => Number.isFinite(new Date(sample.date).getTime()))
    .sort((a, b) => Math.abs(new Date(a.date).getTime() - targetTime) - Math.abs(new Date(b.date).getTime() - targetTime))[0] || null;
}

function deriveIntervalsFromDistanceSamples(workoutInput) {
  const samples = Array.isArray(workoutInput.walkingAndRunningDistance) ? workoutInput.walkingAndRunningDistance : [];
  if (!samples.length) return [];
  return samples.map((sample, index) => {
    const meters = parseDistanceMeters(sample);
    const milesPerMinute = meters ? meters / METERS_PER_MILE : 0;
    return {
      interval_number: index + 1,
      interval_type: milesPerMinute >= 0.075 ? "work" : "recovery",
      distance_meters: meters,
      duration_seconds: 60,
      average_heart_rate_bpm: heartRateValue((workoutInput.heartRateData || [])[index]),
      average_power_watts: null
    };
  });
}

function deriveSplitsFromDistanceSamples(workoutInput) {
  const samples = Array.isArray(workoutInput.walkingAndRunningDistance) ? workoutInput.walkingAndRunningDistance : [];
  if (!samples.length) return [];
  const intervals = deriveIntervalsFromDistanceSamples(workoutInput);
  const totalDuration = parseDuration(pick(workoutInput, ["duration_seconds", "duration", "durationSeconds", "elapsedTime", "Duration"]));
  const splits = splitIntervalsByDistance(intervals, METERS_PER_MILE, totalDuration);
  return splits;
}

function splitIntervalsByDistance(intervals, unitMeters, workoutDurationSeconds = null) {
  const totalSourceSeconds = intervals.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
  const durationScale = totalSourceSeconds && workoutDurationSeconds ? Number(workoutDurationSeconds) / totalSourceSeconds : 1;
  const splits = [];
  let splitDistance = 0;
  let splitDuration = 0;
  let hrWeighted = 0;
  let hrSeconds = 0;

  for (const row of intervals) {
    let remainingDistance = Number(row.distance_meters || 0);
    let remainingDuration = Number(row.duration_seconds || 0) * durationScale;
    const hr = numberOrNull(row.average_heart_rate_bpm);
    if (!remainingDistance || !remainingDuration) continue;
    while (remainingDistance > 0) {
      const needed = unitMeters - splitDistance;
      const takeDistance = Math.min(remainingDistance, needed);
      const portion = takeDistance / remainingDistance;
      const takeDuration = remainingDuration * portion;
      splitDistance += takeDistance;
      splitDuration += takeDuration;
      if (hr !== null) {
        hrWeighted += hr * takeDuration;
        hrSeconds += takeDuration;
      }
      remainingDistance -= takeDistance;
      remainingDuration -= takeDuration;
      if (splitDistance >= unitMeters - 0.01) {
        splits.push(makeDerivedSplit(splits.length + 1, splitDistance, splitDuration, hrWeighted, hrSeconds));
        splitDistance = 0;
        splitDuration = 0;
        hrWeighted = 0;
        hrSeconds = 0;
      }
    }
  }
  if (splitDistance > 1 || splitDuration > 1) {
    splits.push(makeDerivedSplit(splits.length + 1, splitDistance, splitDuration, hrWeighted, hrSeconds));
  }
  return splits;
}

function makeDerivedSplit(splitNumber, distanceMeters, durationSeconds, hrWeighted, hrSeconds) {
  return {
    split_number: splitNumber,
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    average_heart_rate_bpm: hrSeconds ? hrWeighted / hrSeconds : null,
    average_power_watts: null
  };
}

function nullableString(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function secureTokenEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left || "");
  const rightBytes = encoder.encode(right || "");
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return diff === 0 && rightBytes.length > 0;
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
