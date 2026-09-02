const METERS_PER_MILE = 1609.344;
const METERS_PER_KILOMETER = 1000;
const DAY_SECONDS = 86400;

export function metersToMiles(meters) {
  return Number(meters || 0) / METERS_PER_MILE;
}

export function metersToKilometers(meters) {
  return Number(meters || 0) / METERS_PER_KILOMETER;
}

export function secondsPerMile(distanceMeters, durationSeconds) {
  const miles = metersToMiles(distanceMeters);
  if (!miles || !durationSeconds) return null;
  return Number(durationSeconds) / miles;
}

export function secondsPerKilometer(distanceMeters, durationSeconds) {
  const kilometers = metersToKilometers(distanceMeters);
  if (!kilometers || !durationSeconds) return null;
  return Number(durationSeconds) / kilometers;
}

export function paceSeconds(distanceMeters, durationSeconds, unit = "mi") {
  return unit === "km"
    ? secondsPerKilometer(distanceMeters, durationSeconds)
    : secondsPerMile(distanceMeters, durationSeconds);
}

export function formatPace(seconds, unit = "mi") {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Missing";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder} / ${unit}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Missing";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`;
  return `${minutes}:${remainder}`;
}

export function formatDistance(meters, unit = "mi") {
  if (!Number.isFinite(Number(meters))) return "Missing";
  const value = unit === "km" ? metersToKilometers(meters) : metersToMiles(meters);
  return `${value.toFixed(2)} ${unit}`;
}

export function zonePercentages(zones) {
  const total = zones.reduce((sum, zone) => sum + Number(zone.duration_seconds || zone.durationSeconds || 0), 0);
  return zones.map((zone) => {
    const seconds = Number(zone.duration_seconds || zone.durationSeconds || 0);
    return {
      ...zone,
      duration_seconds: seconds,
      percentage: total ? seconds / total : null
    };
  });
}

export function qualifyWorkout(workout, minimumSeconds = 600) {
  return Number(workout?.duration_seconds || workout?.durationSeconds || 0) >= Number(minimumSeconds || 0);
}

export function goalProgress(workouts, goal) {
  const now = goal?.now ? new Date(goal.now) : new Date();
  const target = Number(goal?.targetRuns || goal?.target_value || 12);
  const goalDays = Number(goal?.goalDays || 28);
  const minimumSeconds = Number(goal?.minimumSeconds || goal?.minimum_workout_seconds || 600);
  const start = goal?.startDate ? new Date(goal.startDate) : new Date(now.getTime() - (goalDays - 1) * DAY_SECONDS * 1000);
  const end = goal?.endDate ? new Date(goal.endDate) : now;
  const qualifying = workouts.filter((workout) => {
    const date = new Date(workout.started_at || workout.startedAt);
    return qualifyWorkout(workout, minimumSeconds) && date >= start && date <= end;
  });
  const completed = qualifying.length;
  return {
    completed,
    remaining: Math.max(target - completed, 0),
    target,
    percentage: target ? Math.min(100, Math.round((completed / target) * 100)) : 0,
    start,
    end,
    qualifying
  };
}

export function startOfWeek(date, timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const localMidday = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const day = localMidday.getUTCDay();
  localMidday.setUTCDate(localMidday.getUTCDate() - ((day + 6) % 7));
  return localMidday.toISOString().slice(0, 10);
}

export function weeklyAggregation(workouts, options = {}) {
  const timezone = options.timezone || "UTC";
  const minimumSeconds = Number(options.minimumSeconds || 0);
  const weeks = new Map();
  for (const workout of workouts) {
    if (!qualifyWorkout(workout, minimumSeconds)) continue;
    const startedAt = workout.started_at || workout.startedAt;
    if (!startedAt) continue;
    const key = startOfWeek(new Date(startedAt), timezone);
    const current = weeks.get(key) || { week: key, count: 0, distance_meters: 0, duration_seconds: 0 };
    current.count += 1;
    current.distance_meters += Number(workout.distance_meters || workout.distanceMeters || 0);
    current.duration_seconds += Number(workout.duration_seconds || workout.durationSeconds || 0);
    weeks.set(key, current);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export function consistencyStreak(workouts, options = {}) {
  const timezone = options.timezone || "UTC";
  const minimumSeconds = Number(options.minimumSeconds || 600);
  const now = options.now ? new Date(options.now) : new Date();
  const weekly = new Map(weeklyAggregation(workouts, { timezone, minimumSeconds }).map((week) => [week.week, week]));
  let cursor = new Date(`${startOfWeek(now, timezone)}T12:00:00Z`);
  let streak = 0;
  while (weekly.get(cursor.toISOString().slice(0, 10))?.count > 0) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

export function rollingAverages(items, fields, windowSize = 3) {
  return items.map((item, index) => {
    const window = items.slice(Math.max(0, index - windowSize + 1), index + 1);
    const averages = {};
    for (const field of fields) {
      const values = window.map((candidate) => Number(candidate[field])).filter(Number.isFinite);
      averages[`${field}_rolling_${windowSize}`] = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    }
    return { ...item, ...averages };
  });
}

export function workRecoveryRatio(intervals) {
  const workSeconds = intervals
    .filter((interval) => interval.interval_type === "work")
    .reduce((sum, interval) => sum + Number(interval.duration_seconds || 0), 0);
  const recoverySeconds = intervals
    .filter((interval) => interval.interval_type === "recovery")
    .reduce((sum, interval) => sum + Number(interval.duration_seconds || 0), 0);
  if (!workSeconds && !recoverySeconds) return { workSeconds, recoverySeconds, ratio: null, label: "Missing" };
  if (!recoverySeconds) return { workSeconds, recoverySeconds, ratio: Infinity, label: "Work only" };
  const ratio = workSeconds / recoverySeconds;
  return { workSeconds, recoverySeconds, ratio, label: simplifyRatio(workSeconds, recoverySeconds) };
}

function simplifyRatio(left, right) {
  const divisor = gcd(Math.round(left), Math.round(right)) || 1;
  return `${Math.round(left / divisor)}:${Math.round(right / divisor)}`;
}

function gcd(a, b) {
  while (b) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return Math.abs(a);
}

export function selectComparableWorkout(targetWorkout, workouts, options = {}) {
  const durationTolerance = Number(options.durationTolerance || 0.25);
  const distanceTolerance = Number(options.distanceTolerance || 0.20);
  const paceTolerance = Number(options.paceTolerance || 0.15);
  const targetPace = secondsPerMile(targetWorkout.distance_meters, targetWorkout.duration_seconds);
  const targetStart = new Date(targetWorkout.started_at || targetWorkout.startedAt || 0).getTime();
  const candidates = workouts
    .filter((workout) => workout.id !== targetWorkout.id)
    .filter((workout) => new Date(workout.started_at || workout.startedAt || 0).getTime() < targetStart)
    .map((workout) => {
      const pace = secondsPerMile(workout.distance_meters, workout.duration_seconds);
      const durationDelta = relativeDelta(workout.duration_seconds, targetWorkout.duration_seconds);
      const distanceDelta = relativeDelta(workout.distance_meters, targetWorkout.distance_meters);
      const paceDelta = targetPace && pace ? relativeDelta(pace, targetPace) : 1;
      return { workout, score: durationDelta + distanceDelta + paceDelta, durationDelta, distanceDelta, paceDelta };
    })
    .filter((candidate) => candidate.durationDelta <= durationTolerance)
    .filter((candidate) => candidate.distanceDelta <= distanceTolerance)
    .filter((candidate) => candidate.paceDelta <= paceTolerance)
    .sort((a, b) => a.score - b.score);
  return candidates[0]?.workout || null;
}

function relativeDelta(value, target) {
  const left = Number(value);
  const right = Number(target);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return 1;
  return Math.abs(left - right) / right;
}

export function paceVersusHeartRateTrend(workouts) {
  const points = workouts
    .map((workout) => ({
      pace: secondsPerMile(workout.distance_meters, workout.duration_seconds),
      heartRate: Number(workout.average_heart_rate_bpm),
      date: workout.started_at
    }))
    .filter((point) => Number.isFinite(point.pace) && Number.isFinite(point.heartRate));
  if (points.length < 3) return { supported: false, slope: null, message: "Insufficient data" };
  const n = points.length;
  const meanPace = points.reduce((sum, point) => sum + point.pace, 0) / n;
  const meanHr = points.reduce((sum, point) => sum + point.heartRate, 0) / n;
  const numerator = points.reduce((sum, point) => sum + (point.pace - meanPace) * (point.heartRate - meanHr), 0);
  const denominator = points.reduce((sum, point) => sum + Math.pow(point.pace - meanPace, 2), 0);
  const slope = denominator ? numerator / denominator : null;
  return { supported: true, slope, points };
}

export function daysSinceMostRecentRun(workouts, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const latest = workouts
    .map((workout) => new Date(workout.started_at || workout.startedAt || 0))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => b - a)[0];
  if (!latest) return null;
  return Math.floor((now - latest) / (DAY_SECONDS * 1000));
}

export function runWalkRatio(intervals) {
  const work = intervals.filter((interval) => interval.interval_type === "work");
  const recovery = intervals.filter((interval) => interval.interval_type === "recovery");
  return workRecoveryRatio([...work, ...recovery]);
}

export function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function groupByWorkout(childRows, key = "workout_id") {
  return childRows.reduce((map, row) => {
    const id = row[key];
    if (!map[id]) map[id] = [];
    map[id].push(row);
    return map;
  }, {});
}
