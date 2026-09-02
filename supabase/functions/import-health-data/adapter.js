const METERS_PER_MILE = 1609.344;
const DEFAULT_HR_ZONES = [
  { zone: 1, lower: 0, upper: 129 },
  { zone: 2, lower: 130, upper: 149 },
  { zone: 3, lower: 150, upper: 164 },
  { zone: 4, lower: 165, upper: 179 },
  { zone: 5, lower: 180, upper: null }
];

export const ADAPTER_ASSUMPTIONS = [
  "Health Auto Export payloads are expected to contain one or more workout-like objects under workouts, data.workouts, Workouts, activities, or as a single object.",
  "Supported running workout names include Running, Outdoor Running, Indoor Running, and HKWorkoutActivityTypeRunning.",
  "When a stable workout UUID is absent, the adapter derives source_workout_id from source, start time, duration, distance, and average heart rate.",
  "GPS route samples are deliberately ignored in version 1."
];

export function normalizeHealthAutoExportPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AdapterError("Payload must be a JSON object.");
  }

  const workouts = extractWorkoutCandidates(payload);
  const normalized = [];
  const errors = [];

  workouts.forEach((candidate, index) => {
    try {
      const workout = normalizeWorkout(candidate, index, options);
      if (workout) normalized.push(workout);
    } catch (error) {
      errors.push({ index, message: error.message || "Unsupported workout row." });
    }
  });

  return { workouts: normalized, errors, assumptions: ADAPTER_ASSUMPTIONS };
}

export class AdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterError";
  }
}

export function parseManualCsv(text, options = {}) {
  const rows = parseCsv(text);
  return normalizeHealthAutoExportPayload({ workouts: rows }, options);
}

function extractWorkoutCandidates(payload) {
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

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  if (looksLikeWorkout(payload)) return [payload];
  return [];
}

function looksLikeWorkout(value) {
  return Boolean(
    pick(value, ["workoutActivityType", "workout_type", "activityType", "type", "name"]) ||
    pick(value, ["startDate", "start", "started_at", "date"])
  );
}

function normalizeWorkout(input, index, options) {
  const workoutType = String(pick(input, ["workout_type", "workoutType", "activityType", "workoutActivityType", "type", "name"], "running"));
  if (!/running|run|HKWorkoutActivityTypeRunning/i.test(workoutType)) return null;

  const startedAt = parseDate(pick(input, ["started_at", "startDate", "start_date", "start", "date", "Start"]));
  const endedAt = parseDate(pick(input, ["ended_at", "endDate", "end_date", "end", "End"]));
  const durationSeconds = parseDuration(pick(input, ["duration_seconds", "duration", "durationSeconds", "elapsedTime", "Duration"]));
  const distanceMeters = parseDistanceMeters(input);

  if (!startedAt) throw new AdapterError("Running workout is missing a valid start time.");
  if (!durationSeconds) throw new AdapterError("Running workout is missing a valid duration.");

  const base = {
    source: String(pick(input, ["source", "sourceName", "app", "device"], options.source || "health_auto_export")),
    source_workout_id: String(pick(input, ["source_workout_id", "sourceWorkoutId", "uuid", "id", "workoutId", "externalId"], "")),
    workout_type: "running",
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    active_energy_kcal: energyKcal(pick(input, ["active_energy_kcal", "activeEnergyBurned", "activeEnergy", "activeEnergyKcal", "active_kilocalories"])),
    total_energy_kcal: energyKcal(pick(input, ["total_energy_kcal", "totalEnergy", "totalEnergyKcal", "total_kilocalories"])),
    elevation_gain_meters: distanceQuantityMeters(pick(input, ["elevation_gain_meters", "elevationUp", "elevationGain", "elevationAscended", "totalElevationGain"])),
    average_heart_rate_bpm: heartRateValue(pick(input, ["average_heart_rate_bpm", "averageHeartRate", "avgHeartRate", "avg_hr", "heartRateAverage", "avgHeartRate", "heartRate"])),
    minimum_heart_rate_bpm: heartRateValue(pick(input, ["minimum_heart_rate_bpm", "minimumHeartRate", "minHeartRate", "heartRateMinimum", "heartRate"]), "min"),
    maximum_heart_rate_bpm: heartRateValue(pick(input, ["maximum_heart_rate_bpm", "maximumHeartRate", "maxHeartRate", "heartRateMaximum", "heartRate"]), "max"),
    average_speed_mps: speedMps(pick(input, ["average_speed_mps", "averageSpeed", "avgSpeed", "speed"])),
    average_power_watts: quantityNumber(pick(input, ["average_power_watts", "averagePower", "avgPower"])),
    perceived_effort: nullableString(pick(input, ["perceived_effort", "perceivedEffort", "effort"])),
    notes: nullableString(pick(input, ["notes", "note"])),
    splits: normalizeSplits(pick(input, ["splits", "Splits", "laps", "Laps"], []), input),
    intervals: normalizeIntervals(pick(input, ["intervals", "segments", "workoutIntervals"], []), input),
    zones: normalizeZones(pick(input, ["heart_rate_zones", "heartRateZones", "zones", "Heart Rate Zones"], []), options.defaultZones || DEFAULT_HR_ZONES, input),
    recovery: normalizeRecovery(pick(input, ["heart_rate_recovery", "heartRateRecovery", "recovery"], input))
  };

  if (!base.average_speed_mps && base.distance_meters && base.duration_seconds) {
    base.average_speed_mps = base.distance_meters / base.duration_seconds;
  }

  if (!base.source_workout_id) {
    base.source_workout_id = `fallback:${fallbackIdentity(base, index)}`;
  }

  return base;
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

function normalizeZones(rows, defaultZones = DEFAULT_HR_ZONES, workoutInput = {}) {
  if (!Array.isArray(rows) || !rows.length) return deriveZonesFromHeartRateSamples(workoutInput, defaultZones);
  return rows.map((row, index) => {
    const zoneNumber = numberOrNull(pick(row, ["zone_number", "zoneNumber", "zone", "Zone"], index + 1));
    const defaultZone = defaultZones.find((zone) => Number(zone.zone) === Number(zoneNumber)) || {};
    return {
      zone_number: zoneNumber,
      lower_bound_bpm: numberOrNull(pick(row, ["lower_bound_bpm", "lowerBound", "min", "from"], defaultZone.lower ?? 0)),
      upper_bound_bpm: numberOrNull(pick(row, ["upper_bound_bpm", "upperBound", "max", "to"], defaultZone.upper ?? null)),
      duration_seconds: parseDuration(pick(row, ["duration_seconds", "duration", "durationSeconds", "time", "Time"]))
    };
  }).filter((zone) => zone.zone_number && zone.duration_seconds !== null);
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

function normalizeIntervalType(value) {
  const clean = String(value || "").toLowerCase();
  if (clean.includes("warm")) return "warmup";
  if (clean.includes("recover") || clean.includes("walk")) return "recovery";
  if (clean.includes("cool")) return "cooldown";
  if (clean.includes("work") || clean.includes("run")) return "work";
  return "unknown";
}

function parseDistanceMeters(input) {
  const explicitMeters = distanceQuantityMeters(pick(input, ["distance_meters", "distanceMeters", "distance_m", "meters"]));
  if (explicitMeters !== null) return explicitMeters;
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

function deriveZonesFromHeartRateSamples(workoutInput, defaultZones) {
  const samples = Array.isArray(workoutInput.heartRateData) ? workoutInput.heartRateData : [];
  if (!samples.length) return [];
  return defaultZones.map((zone) => ({
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

function fallbackIdentity(workout, index) {
  return [
    workout.source,
    workout.started_at,
    workout.duration_seconds,
    Math.round(Number(workout.distance_meters || 0)),
    Math.round(Number(workout.average_heart_rate_bpm || 0)),
    index
  ].join(":");
}

function parseCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function splitCsvLine(line) {
  const result = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
}
