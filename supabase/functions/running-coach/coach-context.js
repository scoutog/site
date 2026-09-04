const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;
const RECENT_WORKOUT_LIMIT = 12;
const DETAIL_INTERVAL_LIMIT = 80;
const MESSAGE_LIMIT = 12;
const MAX_MESSAGE_CHARS = 1200;

export function buildCoachContext({
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

function sanitizeMemory(memory) {
  return {
    summary: truncate(memory?.summary || "", 1200),
    preferences: memory?.preferences && typeof memory.preferences === "object" ? memory.preferences : {}
  };
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
