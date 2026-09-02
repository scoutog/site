import {
  average,
  daysSinceMostRecentRun,
  formatDistance,
  formatDuration,
  formatPace,
  goalProgress,
  consistencyStreak,
  groupByWorkout,
  paceSeconds,
  qualifyWorkout,
  rollingAverages,
  secondsPerMile,
  selectComparableWorkout,
  startOfWeek,
  weeklyAggregation,
  workRecoveryRatio,
  zonePercentages
} from "./running-utils.js";

const config = window.RUNNING_CONFIG || {};
const app = {
  supabase: null,
  session: null,
  user: null,
  charts: new Map(),
  workouts: [],
  splits: {},
  intervals: {},
  zones: {},
  recovery: {},
  profile: null,
  activeGoal: null,
  unit: config.defaultDistanceUnit || "mi",
  minimumSeconds: Number(config.defaultMinimumWorkoutSeconds || 600),
  goalDays: 7,
  goalTarget: Number(config.defaultGoalRuns || 3),
  timezone: config.defaultTimezone || "America/New_York",
  zoneSettings: config.defaultHeartRateZones || []
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  [
    "running-lock", "running-dashboard", "unlock-form", "running-password", "remember-device", "unlock-button",
    "lock-message", "logout-button", "refresh-data-button", "dashboard-message", "empty-state", "range-filter", "rolling-toggle",
    "month-run-days", "month-run-summary",
    "goal-boxes", "runs-completed", "runs-remaining", "goal-percent",
    "runs-28-days", "weekly-streak", "days-since-run", "latest-workout", "trend-observations",
    "workouts-table", "settings-form", "goal-target", "goal-days", "minimum-seconds", "distance-unit",
    "timezone-input", "zone-form", "zone-inputs",
    "workout-dialog", "dialog-title", "dialog-subtitle", "dialog-body"
  ].forEach((id) => { els[id] = document.getElementById(id); });

  if (!isConfigured()) {
    setLockMessage("Dashboard configuration is not ready yet.");
    els["unlock-button"].disabled = true;
    return;
  }

  els["unlock-form"].addEventListener("submit", unlock);
  els["logout-button"].addEventListener("click", logout);
  els["refresh-data-button"].addEventListener("click", loadData);
  els["range-filter"].addEventListener("change", renderDashboard);
  els["rolling-toggle"].addEventListener("change", renderDashboard);
  els["settings-form"].addEventListener("submit", saveSettings);
  els["zone-form"].addEventListener("submit", saveZones);
  els["workout-dialog"].addEventListener("close", clearWorkoutQuery);

  renderZoneInputs();
  await restoreSession();
}

function isConfigured() {
  return /^https:\/\/.+\.supabase\.co$/.test(config.supabaseUrl || "") &&
    config.supabaseAnonKey &&
    !String(config.supabaseAnonKey).startsWith("YOUR_") &&
    config.authEmail &&
    !String(config.authEmail).includes("example.com");
}

function storageAdapter(storage) {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key)
  };
}

function createClient(remember) {
  return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: storageAdapter(remember ? localStorage : sessionStorage)
    }
  });
}

async function restoreSession() {
  for (const remember of [true, false]) {
    const client = createClient(remember);
    const { data } = await client.auth.getSession();
    if (data?.session) {
      app.supabase = client;
      app.session = data.session;
      app.user = data.session.user;
      return enterDashboard();
    }
  }
  showLock("Expired sessions return here automatically.");
}

async function unlock(event) {
  event.preventDefault();
  setLockMessage("Unlocking...");
  els["unlock-button"].disabled = true;
  const remember = els["remember-device"].checked;
  app.supabase = createClient(remember);
  const { data, error } = await app.supabase.auth.signInWithPassword({
    email: config.authEmail,
    password: els["running-password"].value
  });
  els["running-password"].value = "";
  els["unlock-button"].disabled = false;
  if (error || !data?.session) {
    app.supabase = null;
    setLockMessage("Unable to unlock. Check the password and try again.");
    return;
  }
  app.session = data.session;
  app.user = data.user;
  await enterDashboard();
}

async function enterDashboard() {
  showDashboard();
  await ensureProfileAndGoal();
  await loadData();
}

function showLock(message = "") {
  clearPrivateData();
  els["running-dashboard"].hidden = true;
  els["running-dashboard"].inert = true;
  els["running-dashboard"].setAttribute("aria-hidden", "true");
  els["running-lock"].hidden = false;
  els["running-lock"].inert = false;
  els["running-lock"].removeAttribute("aria-hidden");
  setLockMessage(message);
}

function showDashboard() {
  els["running-lock"].hidden = true;
  els["running-lock"].inert = true;
  els["running-lock"].setAttribute("aria-hidden", "true");
  els["running-dashboard"].hidden = false;
  els["running-dashboard"].inert = false;
  els["running-dashboard"].removeAttribute("aria-hidden");
  setLockMessage("");
}

function setLockMessage(message) {
  els["lock-message"].textContent = message;
}

function setDashboardMessage(message, hidden = false) {
  els["dashboard-message"].hidden = hidden || !message;
  els["dashboard-message"].textContent = message || "";
}

async function ensureProfileAndGoal() {
  const email = app.user?.email || config.authEmail;
  await app.supabase.from("profiles").upsert({
    id: app.user.id,
    email,
    timezone: app.timezone,
    preferred_distance_unit: app.unit,
    minimum_counted_workout_seconds: app.minimumSeconds
  });

  const { data: profile } = await app.supabase.from("profiles").select("*").eq("id", app.user.id).single();
  if (profile) {
    app.profile = profile;
    app.unit = profile.preferred_distance_unit || app.unit;
    app.minimumSeconds = Number(profile.minimum_counted_workout_seconds || app.minimumSeconds);
    app.timezone = profile.timezone || app.timezone;
  }
  app.goalTarget = Number(config.defaultGoalRuns || 3);
  app.goalDays = 7;

  const { data: goals } = await app.supabase
    .from("goals")
    .select("*")
    .eq("user_id", app.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  const week = currentGoalWeek();

  if (goals?.[0]) {
    app.activeGoal = goals[0];
    app.minimumSeconds = Number(goals[0].minimum_workout_seconds || app.minimumSeconds);
    await app.supabase.from("goals").update({
      goal_type: "weekly_workout_count",
      target_value: app.goalTarget,
      minimum_workout_seconds: app.minimumSeconds,
      start_date: week.start,
      end_date: week.end,
      status: "active"
    }).eq("id", app.activeGoal.id);
  } else {
    const { data } = await app.supabase.from("goals").insert({
      user_id: app.user.id,
      goal_type: "weekly_workout_count",
      target_value: app.goalTarget,
      minimum_workout_seconds: app.minimumSeconds,
      start_date: week.start,
      end_date: week.end,
      status: "active"
    }).select("*").single();
    app.activeGoal = data;
  }

  populateSettings();
}

async function loadData() {
  setDashboardMessage("Loading running data...");
  const { data: workouts, error } = await app.supabase
    .from("workouts")
    .select("*")
    .order("started_at", { ascending: true });
  if (error) {
    if (error.status === 401) {
      await logout("Session expired. Unlock again to continue.");
      return;
    }
    setDashboardMessage("Unable to load workout data. Check the connection and Supabase configuration.");
    return;
  }

  app.workouts = workouts || [];
  const workoutIds = app.workouts.map((workout) => workout.id);
  if (workoutIds.length) {
    const [splits, intervals, zones, recovery] = await Promise.all([
      app.supabase.from("workout_splits").select("*").in("workout_id", workoutIds).order("split_number"),
      app.supabase.from("workout_intervals").select("*").in("workout_id", workoutIds).order("interval_number"),
      app.supabase.from("heart_rate_zones").select("*").in("workout_id", workoutIds).order("zone_number"),
      app.supabase.from("heart_rate_recovery").select("*").in("workout_id", workoutIds)
    ]);
    app.splits = groupByWorkout(splits.data || []);
    app.intervals = groupByWorkout(intervals.data || []);
    app.zones = groupByWorkout(zones.data || []);
    app.recovery = (recovery.data || []).reduce((map, row) => ({ ...map, [row.workout_id]: row }), {});
  } else {
    app.splits = {};
    app.intervals = {};
    app.zones = {};
    app.recovery = {};
  }
  setDashboardMessage("", true);
  renderDashboard();
  openWorkoutFromQuery();
}

function renderDashboard() {
  const filtered = filteredWorkouts();
  els["empty-state"].hidden = app.workouts.length !== 0;
  renderMonthStrip(app.workouts);
  renderGoal(app.workouts);
  renderLatest(app.workouts);
  renderObservations(app.workouts);
  renderWorkoutTable(filtered);
  renderCharts(filtered);
}

function filteredWorkouts() {
  const range = els["range-filter"].value;
  if (range === "all") return [...app.workouts];
  const since = Date.now() - Number(range) * 86400000;
  return app.workouts.filter((workout) => new Date(workout.started_at).getTime() >= since);
}

function renderMonthStrip(workouts) {
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: app.timezone, year: "numeric" }).format(now));
  const month = Number(new Intl.DateTimeFormat("en-CA", { timeZone: app.timezone, month: "numeric" }).format(now));
  const todayKey = localDateKey(now);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const runsByDay = workouts
    .filter((workout) => qualifyWorkout(workout, app.minimumSeconds))
    .reduce((map, workout) => {
      const key = localDateKey(new Date(workout.started_at));
      if (!key.startsWith(monthPrefix)) return map;
      const day = map.get(key) || { count: 0, distanceMeters: 0, durationSeconds: 0 };
      day.count += 1;
      day.distanceMeters += Number(workout.distance_meters || 0);
      day.durationSeconds += Number(workout.duration_seconds || 0);
      map.set(key, day);
      return map;
    }, new Map());
  els["month-run-days"].style.setProperty("--month-days", daysInMonth);
  els["month-run-days"].innerHTML = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const runDay = runsByDay.get(key);
    const status = runDay ? "run" : key > todayKey ? "future" : "rest";
    const label = monthDayLabel(month, day, status, runDay);
    return `<span class="month-day is-${status}" tabindex="0" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" data-tooltip="${escapeHtml(label)}">${day}</span>`;
  }).join("");
  const monthTotal = [...runsByDay.values()].reduce((total, day) => ({
    count: total.count + day.count,
    distanceMeters: total.distanceMeters + day.distanceMeters,
    durationSeconds: total.durationSeconds + day.durationSeconds
  }), { count: 0, distanceMeters: 0, durationSeconds: 0 });
  els["month-run-summary"].textContent = `${monthTotal.count} run${monthTotal.count === 1 ? "" : "s"} · ${formatDuration(monthTotal.durationSeconds)} · ${formatDistance(monthTotal.distanceMeters, app.unit)}`;
}

function monthDayLabel(month, day, status, runDay) {
  const date = `${shortMonthName(month)} ${day}`;
  if (status === "future") return `${date}: not happened yet`;
  if (!runDay) return `${date}: No runs`;
  const prefix = runDay.count === 1 ? `${date}: 1 run` : `${date}: ${runDay.count} runs`;
  return `${prefix} · ${formatDistance(runDay.distanceMeters, app.unit)} · ${formatDuration(runDay.durationSeconds)}`;
}

function shortMonthName(month) {
  return ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."][month - 1] || "";
}

function renderGoal(workouts) {
  const progress = currentWeekGoalProgress(workouts);
  els["goal-boxes"].innerHTML = Array.from({ length: app.goalTarget }, (_, index) => {
    const filled = index < progress.completed ? " is-filled" : "";
    return `<span class="goal-box${filled}" aria-label="${index + 1} of ${app.goalTarget}"></span>`;
  }).join("");
  setText("runs-completed", String(progress.completed));
  setText("runs-remaining", String(progress.remaining));
  setText("goal-percent", `${progress.percentage}%`);
  const last28 = goalProgress(workouts, { targetRuns: 999, goalDays: 28, minimumSeconds: app.minimumSeconds }).completed;
  setText("runs-28-days", String(last28));
  const streak = consistencyStreak(workouts, { timezone: app.timezone, minimumSeconds: app.minimumSeconds });
  setText("weekly-streak", `${streak} week${streak === 1 ? "" : "s"}`);
  const days = daysSinceMostRecentRun(workouts);
  setText("days-since-run", days === null ? "Missing" : String(days));
}

function currentWeekGoalProgress(workouts) {
  const week = currentGoalWeek();
  const qualifying = workouts.filter((workout) => {
    if (!qualifyWorkout(workout, app.minimumSeconds)) return false;
    const key = localDateKey(new Date(workout.started_at));
    return key >= week.start && key <= week.end;
  });
  const completed = qualifying.length;
  return {
    completed,
    remaining: Math.max(app.goalTarget - completed, 0),
    target: app.goalTarget,
    percentage: app.goalTarget ? Math.min(100, Math.round((completed / app.goalTarget) * 100)) : 0,
    qualifying,
    ...week
  };
}

function currentGoalWeek() {
  const start = startOfWeek(new Date(), app.timezone);
  return { start, end: addDays(start, 6) };
}

function setText(id, value) {
  els[id].textContent = value;
}

function renderLatest(workouts) {
  const latest = [...workouts].sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
  if (!latest) {
    els["latest-workout"].innerHTML = `<p class="brief-sub">No imported workouts yet.</p>`;
    return;
  }
  const zones = zonePercentages(app.zones[latest.id] || []);
  const zone5 = zones.find((zone) => Number(zone.zone_number) === 5);
  const intervals = app.intervals[latest.id] || [];
  const interval = intervalSummary(intervals);
  const comparable = selectComparableWorkout(latest, workouts);
  const comparison = comparable ? compareWorkout(latest, comparable) : "No similar earlier workout yet.";
  els["latest-workout"].innerHTML = `
    <div class="latest-metrics">
      ${metric("Date", formatDateTime(latest.started_at))}
      ${metric("Distance", formatDistanceOrMissing(latest.distance_meters))}
      ${metric("Duration", formatDurationOrMissing(latest.duration_seconds))}
      ${metric("Average pace", formatPace(paceSeconds(latest.distance_meters, latest.duration_seconds, app.unit), app.unit))}
      ${metric("Average HR", bpm(latest.average_heart_rate_bpm))}
      ${metric("Maximum HR", bpm(latest.maximum_heart_rate_bpm))}
      ${metric("Zone 5", zone5 ? `${formatDuration(zone5.duration_seconds)} (${Math.round(zone5.percentage * 100)}%)` : "Missing")}
      ${metric("Work time", interval.workSeconds ? formatDuration(interval.workSeconds) : "Missing")}
      ${metric("Recovery time", interval.recoverySeconds ? formatDuration(interval.recoverySeconds) : "Missing")}
      ${metric("Work/recovery", interval.label)}
    </div>
    <div class="zone-bars">${renderZoneBars(zones)}</div>
    <p class="running-comparison">${comparison}</p>
    <button type="button" data-workout-open="${latest.id}">Open workout detail</button>
  `;
  els["latest-workout"].querySelector("[data-workout-open]").addEventListener("click", () => openWorkout(latest.id, true));
}

function renderObservations(workouts) {
  const observations = [];
  const sorted = [...workouts].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
  const qualifying = sorted.filter((workout) => qualifyWorkout(workout, app.minimumSeconds));
  const goal = currentWeekGoalProgress(sorted);
  observations.push(`Training trend: you are ${goal.completed} of ${goal.target} workouts into your current goal.`);
  const recent = qualifying.slice(-3);
  if (recent.length === 3) {
    const firstHr = recent[0].average_heart_rate_bpm;
    const lastHr = recent[2].average_heart_rate_bpm;
    const firstPace = paceSeconds(recent[0].distance_meters, recent[0].duration_seconds, app.unit);
    const lastPace = paceSeconds(recent[2].distance_meters, recent[2].duration_seconds, app.unit);
    if (Number.isFinite(Number(firstHr)) && Number.isFinite(Number(lastHr)) && firstPace && lastPace && Math.abs(lastPace - firstPace) / firstPace < 0.06) {
      const diff = Math.round(Number(lastHr) - Number(firstHr));
      observations.push(`Training trend: average HR ${diff <= 0 ? "decreased" : "increased"} by ${Math.abs(diff)} BPM across your last three similarly paced workouts.`);
    }
  }
  const weekly = weeklyAggregation(sorted, { timezone: app.timezone, minimumSeconds: app.minimumSeconds });
  const latestWeek = weekly.at(-1);
  if (latestWeek) observations.push(`Training trend: you completed ${latestWeek.count} qualifying run${latestWeek.count === 1 ? "" : "s"} this week.`);
  if (sorted.length >= 2) {
    const previous = sorted.at(-2);
    const latest = sorted.at(-1);
    const previousZ5 = zonePercent(previous.id, 5);
    const latestZ5 = zonePercent(latest.id, 5);
    const previousPace = paceSeconds(previous.distance_meters, previous.duration_seconds, app.unit);
    const latestPace = paceSeconds(latest.distance_meters, latest.duration_seconds, app.unit);
    if (previousZ5 !== null && latestZ5 !== null && previousPace && latestPace && latestZ5 < previousZ5 && Math.abs(latestPace - previousPace) / previousPace < 0.07) {
      observations.push("Training trend: Zone 5 time decreased while average pace remained stable.");
    }
    const previousRatio = workRecoveryRatio(app.intervals[previous.id] || []);
    const latestRatio = workRecoveryRatio(app.intervals[latest.id] || []);
    if (previousRatio.ratio && latestRatio.ratio && latestRatio.ratio > previousRatio.ratio) {
      observations.push(`Training trend: your work-to-recovery ratio increased from ${previousRatio.label} to ${latestRatio.label}.`);
    }
  }
  els["trend-observations"].innerHTML = observations.length
    ? observations.map((item) => `<p>${escapeHtml(item)}</p>`).join("")
    : `<p class="brief-sub">Charts need more workouts before trend observations are supported.</p>`;
}

function renderWorkoutTable(workouts) {
  els["workouts-table"].innerHTML = workouts.length ? workouts.map((workout) => {
    const z5 = zonePercent(workout.id, 5);
    return `
      <tr>
        <td>${formatDate(workout.started_at)}</td>
        <td>${formatDistanceOrMissing(workout.distance_meters)}</td>
        <td>${formatDurationOrMissing(workout.duration_seconds)}</td>
        <td>${formatPace(paceSeconds(workout.distance_meters, workout.duration_seconds, app.unit), app.unit)}</td>
        <td>${bpm(workout.average_heart_rate_bpm)}</td>
        <td>${z5 === null ? "Missing" : `${Math.round(z5 * 100)}%`}</td>
        <td><button type="button" data-workout-open="${workout.id}">Open</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7">No workouts in this range.</td></tr>`;
  els["workouts-table"].querySelectorAll("[data-workout-open]").forEach((button) => {
    button.addEventListener("click", () => openWorkout(button.dataset.workoutOpen, true));
  });
}

function renderCharts(workouts) {
  const labels = workouts.map((workout) => formatDate(workout.started_at));
  const pace = workouts.map((workout) => paceMinutes(workout));
  const hr = workouts.map((workout) => roundedNumberOrNull(workout.average_heart_rate_bpm));
  const rolled = rollingAverages(workouts.map((workout) => ({
    ...workout,
    pace_value: paceMinutes(workout),
    hr_value: roundedNumberOrNull(workout.average_heart_rate_bpm)
  })), ["pace_value", "hr_value"], 3);
  const weekly = weeklyAggregation(workouts, { timezone: app.timezone, minimumSeconds: app.minimumSeconds });
  const weeklyLabels = weekly.map((week) => week.week);
  const chartBase = chartOptions();
  const selectedPace = maybeRolling(pace, rolled, "pace_value_rolling_3");
  const selectedHr = maybeRolling(hr, rolled, "hr_value_rolling_3");
  const workHr = workouts.map((workout) => intervalHr(workout.id, "work"));
  const recoveryHr = workouts.map((workout) => intervalHr(workout.id, "recovery"));
  const oneMinuteRecovery = workouts.map((workout) => recoveryDrop(workout.id, 1));
  const twoMinuteRecovery = workouts.map((workout) => recoveryDrop(workout.id, 2));

  drawChart("pace-chart", "line", labels, [{ label: `Pace min/${app.unit}`, data: selectedPace, borderColor: "#818cf8", backgroundColor: "rgba(129,140,248,.18)", tension: 0.25 }], chartOptions({ y: paddedScale(selectedPace, { minSpan: 3, tickPrecision: 1 }) }));
  drawChart("hr-chart", "line", labels, [{ label: "Average HR BPM", data: selectedHr, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.18)", tension: 0.25 }], chartOptions({ y: paddedScale(selectedHr, { minSpan: 40, tickPrecision: 0 }) }));
  drawChart("pace-hr-chart", "line", labels, [
    { label: `Pace min/${app.unit}`, data: pace, borderColor: "#818cf8", yAxisID: "y" },
    { label: "Average HR BPM", data: hr, borderColor: "#22c55e", yAxisID: "y1" }
  ], chartOptions({
    y: paddedScale(pace, { minSpan: 3, tickPrecision: 1 }),
    y1: paddedScale(hr, { minSpan: 40, position: "right", drawGrid: false, tickPrecision: 0 })
  }));
  drawChart("rolling-chart", "line", labels, [
    { label: `3-workout pace min/${app.unit}`, data: rolled.map((row) => row.pace_value_rolling_3), borderColor: "#a78bfa", yAxisID: "y" },
    { label: "3-workout HR", data: rolled.map((row) => roundedNumberOrNull(row.hr_value_rolling_3)), borderColor: "#34d399", yAxisID: "y1" }
  ], chartOptions({
    y: paddedScale(rolled.map((row) => row.pace_value_rolling_3), { minSpan: 3, tickPrecision: 1 }),
    y1: paddedScale(rolled.map((row) => roundedNumberOrNull(row.hr_value_rolling_3)), { minSpan: 40, position: "right", drawGrid: false, tickPrecision: 0 })
  }));
  drawChart("weekly-count-chart", "bar", weeklyLabels, [{ label: "Qualifying runs", data: weekly.map((week) => week.count), backgroundColor: "#818cf8" }], chartBase);
  drawChart("weekly-distance-chart", "bar", weeklyLabels, [{ label: `Distance ${app.unit}`, data: weekly.map((week) => app.unit === "km" ? week.distance_meters / 1000 : week.distance_meters / 1609.344), backgroundColor: "#38bdf8" }], chartBase);
  drawChart("weekly-duration-chart", "bar", weeklyLabels, [{ label: "Duration minutes", data: weekly.map((week) => week.duration_seconds / 60), backgroundColor: "#f59e0b" }], chartBase);
  drawZoneDistribution(workouts);
  drawChart("zone5-chart", "line", labels, [{ label: "Zone 5 percentage", data: workouts.map((workout) => zonePercent(workout.id, 5)), borderColor: "#f43f5e", backgroundColor: "rgba(244,63,94,.18)" }], chartBase);
  drawChart("run-walk-chart", "bar", labels, [
    { label: "Work minutes", data: workouts.map((workout) => intervalSummary(app.intervals[workout.id] || []).workSeconds / 60 || null), backgroundColor: "#22c55e" },
    { label: "Recovery minutes", data: workouts.map((workout) => intervalSummary(app.intervals[workout.id] || []).recoverySeconds / 60 || null), backgroundColor: "#71717a" }
  ], { ...chartBase, scales: { x: { stacked: true, ticks: { color: "#a1a1aa", maxRotation: 0 }, grid: { color: "#27272a" } }, y: { stacked: true, ticks: { color: "#a1a1aa" }, grid: { color: "#27272a" } } } });
  const workPace = workouts.map(workIntervalPace);
  drawChart("work-pace-chart", "line", labels, [{ label: `Work interval pace min/${app.unit}`, data: workPace, borderColor: "#c084fc" }], chartOptions({ y: paddedScale(workPace, { minSpan: 3, tickPrecision: 1 }) }));
  drawChart("work-recovery-hr-chart", "bar", labels, [
    { label: "Work HR", data: workHr, backgroundColor: "#22c55e" },
    { label: "Recovery HR", data: recoveryHr, backgroundColor: "#60a5fa" }
  ], chartOptions({ y: paddedScale([...workHr, ...recoveryHr], { minSpan: 40, tickPrecision: 0 }) }));
  const scatterPoints = workouts.map((workout) => ({ x: paceMinutes(workout), y: roundedNumberOrNull(workout.average_heart_rate_bpm) })).filter((point) => point.x && point.y);
  drawChart("scatter-chart", "scatter", labels, [{ label: `Pace min/${app.unit} vs HR`, data: scatterPoints, backgroundColor: "#f97316" }], chartOptions({
    x: paddedScale(scatterPoints.map((point) => point.x), { minSpan: 3, tickPrecision: 1 }),
    y: paddedScale(scatterPoints.map((point) => point.y), { minSpan: 40, tickPrecision: 0 })
  }));
  drawChart("recovery-chart", "line", labels, [
    { label: "1-minute HR drop", data: oneMinuteRecovery, borderColor: "#eab308" },
    { label: "2-minute HR drop", data: twoMinuteRecovery, borderColor: "#84cc16" }
  ], chartOptions({ y: paddedScale([...oneMinuteRecovery, ...twoMinuteRecovery], { minSpan: 20, suggestedMin: 0, tickPrecision: 0 }) }));
}

function drawZoneDistribution(workouts) {
  const labels = workouts.map((workout) => formatDate(workout.started_at));
  const colors = ["#60a5fa", "#22c55e", "#eab308", "#f97316", "#f43f5e"];
  const datasets = [1, 2, 3, 4, 5].map((zoneNumber, index) => ({
    label: `Zone ${zoneNumber}`,
    data: workouts.map((workout) => zonePercent(workout.id, zoneNumber)),
    backgroundColor: colors[index]
  }));
  drawChart("zone-distribution-chart", "bar", labels, datasets, chartOptions({ x: { stacked: true }, y: { stacked: true, min: 0, max: 1 } }));
}

function drawChart(id, type, labels, datasets, options) {
  const canvas = document.getElementById(id);
  const empty = canvas.parentElement.querySelector(".chart-empty");
  const hasData = datasets.some((dataset) => (dataset.data || []).some((value) => value !== null && value !== undefined && Number.isFinite(typeof value === "object" ? value.y : value)));
  empty.textContent = hasData ? "" : "Insufficient data for this chart.";
  canvas.hidden = !hasData;
  if (!hasData || !window.Chart) return;
  app.charts.get(id)?.destroy();
  app.charts.set(id, new Chart(canvas, { type, data: { labels, datasets }, options }));
}

function chartOptions(scales = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#d4d4d8" } } },
    scales: chartScales(scales)
  };
}

function chartScales(overrides = {}) {
  const scales = {
    x: axisScale({ maxRotation: 0, ...overrides.x }),
    y: axisScale(overrides.y)
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== "x" && key !== "y") scales[key] = axisScale(value);
  }
  return scales;
}

function axisScale(options = {}) {
  const { drawGrid = true, tickPrecision, maxRotation, ...rest } = options || {};
  return {
    ...rest,
    ticks: { color: "#a1a1aa", precision: tickPrecision, maxRotation, ...(rest.ticks || {}) },
    grid: { color: "#27272a", drawOnChartArea: drawGrid, ...(rest.grid || {}) }
  };
}

function paddedScale(values, options = {}) {
  const { minSpan = 0, paddingRatio = 0.16, suggestedMin, ...axisOptions } = options;
  const finite = values
    .map((value) => Number(value))
    .filter(Number.isFinite);
  const axis = axisScale(axisOptions);
  if (!finite.length) return axis;

  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const rawSpan = rawMax - rawMin;
  const span = Math.max(rawSpan, Number(minSpan));
  const center = (rawMin + rawMax) / 2;
  const padding = span * Number(paddingRatio);
  const min = center - span / 2 - padding;
  const max = center + span / 2 + padding;

  axis.min = Number.isFinite(suggestedMin) ? Math.min(suggestedMin, min) : min;
  axis.max = max;
  return axis;
}

function maybeRolling(values, rolled, field) {
  return els["rolling-toggle"].checked ? rolled.map((row) => row[field]) : values;
}

function renderWorkoutDetailCharts(workout, intervals) {
  const rows = intervals
    .slice()
    .sort((a, b) => Number(a.interval_number) - Number(b.interval_number));
  const labels = rows.map((row) => String(row.interval_number));
  const colors = rows.map((row) => row.interval_type === "work" ? "#22c55e" : row.interval_type === "recovery" ? "#71717a" : "#818cf8");
  drawChart("detail-interval-chart", "bar", labels, [
    {
      label: `Distance ${app.unit}`,
      data: rows.map((row) => distanceValue(row.distance_meters)),
      backgroundColor: colors,
      yAxisID: "y"
    },
    {
      label: "Avg HR",
      data: rows.map((row) => roundedNumberOrNull(row.average_heart_rate_bpm)),
      borderColor: "#f43f5e",
      backgroundColor: "#f43f5e",
      type: "line",
      yAxisID: "y1",
      tension: 0.2
    }
  ], chartOptions({
    y: { min: 0 },
    y1: paddedScale(rows.map((row) => roundedNumberOrNull(row.average_heart_rate_bpm)), { minSpan: 50, position: "right", drawGrid: false, tickPrecision: 0 })
  }));
}

function openWorkout(id, pushState = false) {
  const workout = app.workouts.find((candidate) => candidate.id === id);
  if (!workout) return;
  if (pushState) {
    const url = new URL(window.location.href);
    url.searchParams.set("workout", id);
    history.pushState({}, "", url);
  }
  const comparable = selectComparableWorkout(workout, app.workouts);
  const intervals = app.intervals[workout.id] || [];
  const exactSplits = exactWorkoutSplits(workout, intervals);
  const zones = zonePercentages(app.zones[workout.id] || []);
  els["dialog-title"].textContent = "Workout Detail";
  els["dialog-subtitle"].textContent = `${formatDateTime(workout.started_at)} · ${formatDistanceOrMissing(workout.distance_meters)}`;
  els["dialog-body"].innerHTML = `
    <section class="dialog-grid">
      ${metric("Distance", formatDistanceOrMissing(workout.distance_meters))}
      ${metric("Duration", formatDurationOrMissing(workout.duration_seconds))}
      ${metric("Average pace", formatPace(paceSeconds(workout.distance_meters, workout.duration_seconds, app.unit), app.unit))}
      ${metric("Average HR", bpm(workout.average_heart_rate_bpm))}
      ${metric("Maximum HR", bpm(workout.maximum_heart_rate_bpm))}
      ${metric("Work/recovery", intervalSummary(app.intervals[workout.id] || []).label)}
    </section>
    <p class="running-comparison">${comparable ? compareWorkout(workout, comparable) : "No comparable earlier workout found within the documented duration, distance, and pace tolerances."}</p>
    ${table(`Splits by ${app.unit === "km" ? "kilometer" : "mile"}`, ["#", "Distance", "Duration", "Avg HR"], exactSplits, (row) => [row.split_number, formatDistanceOrMissing(row.distance_meters), formatDurationOrMissing(row.duration_seconds), bpm(row.average_heart_rate_bpm)])}
    <section class="detail-chart">
      <h3>Intervals</h3>
      <canvas id="detail-interval-chart" aria-label="Workout interval chart"></canvas>
      <p class="chart-empty"></p>
      <details class="detail-collapse">
        <summary>Show interval table</summary>
        ${table("", ["#", "Type", "Distance", "Duration", "Avg HR"], intervals, (row) => [row.interval_number, row.interval_type, formatDistanceOrMissing(row.distance_meters), formatDurationOrMissing(row.duration_seconds), bpm(row.average_heart_rate_bpm)])}
      </details>
    </section>
    <section class="detail-zone-bars">
      <h3>Heart-rate zones</h3>
      <div class="zone-bars">${renderZoneBars(zones)}</div>
    </section>
    ${renderRecovery(workout.id)}
    <label class="running-field"><span>Notes</span><textarea id="detail-notes">${escapeHtml(workout.notes || "")}</textarea></label>
    <div class="dialog-actions">
      <button id="save-notes-button" type="button">Save notes</button>
      <button id="delete-workout-button" type="button" class="danger-button">Delete workout</button>
    </div>
  `;
  els["dialog-body"].querySelector("#save-notes-button").addEventListener("click", () => saveNotes(workout.id));
  els["dialog-body"].querySelector("#delete-workout-button").addEventListener("click", () => deleteWorkout(workout.id));
  els["workout-dialog"].showModal();
  renderWorkoutDetailCharts(workout, intervals);
}

function openWorkoutFromQuery() {
  const id = new URL(window.location.href).searchParams.get("workout");
  if (id) openWorkout(id, false);
}

window.addEventListener("popstate", () => {
  if (els["workout-dialog"].open) els["workout-dialog"].close();
  openWorkoutFromQuery();
});

function clearWorkoutQuery() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("workout")) {
    url.searchParams.delete("workout");
    history.replaceState({}, "", url);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  app.goalTarget = Number(els["goal-target"].value || 3);
  app.goalDays = 7;
  app.minimumSeconds = Number(els["minimum-seconds"].value || 600);
  app.unit = els["distance-unit"].value;
  app.timezone = els["timezone-input"].value || config.defaultTimezone;

  await app.supabase.from("profiles").update({
    timezone: app.timezone,
    preferred_distance_unit: app.unit,
    minimum_counted_workout_seconds: app.minimumSeconds
  }).eq("id", app.user.id);

  const week = currentGoalWeek();
  if (app.activeGoal) {
    await app.supabase.from("goals").update({
      goal_type: "weekly_workout_count",
      target_value: app.goalTarget,
      minimum_workout_seconds: app.minimumSeconds,
      start_date: week.start,
      end_date: week.end
    }).eq("id", app.activeGoal.id);
  }
  setDashboardMessage("Settings saved.");
  renderDashboard();
}

function populateSettings() {
  els["goal-target"].value = app.goalTarget;
  els["goal-days"].value = 7;
  els["minimum-seconds"].value = app.minimumSeconds;
  els["distance-unit"].value = app.unit;
  els["timezone-input"].value = app.timezone;
}

function renderZoneInputs() {
  const saved = localStorage.getItem("scout_running_zone_settings");
  if (saved) app.zoneSettings = JSON.parse(saved);
  els["zone-inputs"].innerHTML = app.zoneSettings.map((zone) => `
    <div class="zone-input-row">
      <span>Zone ${zone.zone}</span>
      <input aria-label="Zone ${zone.zone} lower bound" data-zone="${zone.zone}" data-bound="lower" type="number" min="0" value="${zone.lower}">
      <input aria-label="Zone ${zone.zone} upper bound" data-zone="${zone.zone}" data-bound="upper" type="number" min="0" value="${zone.upper ?? ""}" placeholder="max">
    </div>
  `).join("");
}

function saveZones(event) {
  event.preventDefault();
  const rows = [...els["zone-inputs"].querySelectorAll(".zone-input-row")].map((row) => {
    const lower = row.querySelector("[data-bound='lower']");
    const upper = row.querySelector("[data-bound='upper']");
    return { zone: Number(lower.dataset.zone), lower: Number(lower.value || 0), upper: upper.value === "" ? null : Number(upper.value) };
  });
  app.zoneSettings = rows;
  localStorage.setItem("scout_running_zone_settings", JSON.stringify(rows));
  setDashboardMessage("Heart-rate-zone boundaries saved on this device.");
}

async function saveNotes(id) {
  const notes = els["dialog-body"].querySelector("#detail-notes").value;
  await app.supabase.from("workouts").update({ notes }).eq("id", id);
  const workout = app.workouts.find((candidate) => candidate.id === id);
  if (workout) workout.notes = notes;
  setDashboardMessage("Notes saved.");
}

async function deleteWorkout(id) {
  if (!confirm("Delete this workout and its splits, intervals, zones, and recovery data?")) return;
  await app.supabase.from("workouts").delete().eq("id", id);
  els["workout-dialog"].close();
  await loadData();
}

async function logout(message = "") {
  if (app.supabase) await app.supabase.auth.signOut();
  localStorage.removeItem(authStorageKey());
  sessionStorage.removeItem(authStorageKey());
  app.supabase = null;
  app.session = null;
  app.user = null;
  showLock(message);
}

function clearPrivateData() {
  app.workouts = [];
  app.splits = {};
  app.intervals = {};
  app.zones = {};
  app.recovery = {};
  app.charts.forEach((chart) => chart.destroy());
  app.charts.clear();
  ["latest-workout", "trend-observations", "workouts-table"].forEach((id) => {
    if (els[id]) els[id].innerHTML = "";
  });
}

function authStorageKey() {
  try {
    const host = new URL(config.supabaseUrl).hostname.split(".")[0];
    return `sb-${host}-auth-token`;
  } catch (_error) {
    return "";
  }
}

function metric(label, value) {
  return `<div class="running-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderZoneBars(zones) {
  if (!zones.length) return `<p class="brief-sub">Heart-rate-zone distribution is missing.</p>`;
  return zones.map((zone) => {
    const percentage = Math.round((zone.percentage || 0) * 100);
    const bounds = zoneBounds(zone);
    return `<div class="zone-bar zone-${zone.zone_number}"><span>Zone ${zone.zone_number}<small>${escapeHtml(bounds)}</small></span><i style="--zone-width:${percentage}%"></i><strong>${formatDurationOrMissing(zone.duration_seconds)} · ${percentage}%</strong></div>`;
  }).join("");
}

function table(title, headings, rows, mapRow) {
  const heading = title ? `<h3>${title}</h3>` : "";
  if (!rows.length) return `<section class="detail-table">${heading}<p class="brief-sub">Missing data.</p></section>`;
  return `<section class="detail-table">${heading}<table><thead><tr>${headings.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${mapRow(row).map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

function renderRecovery(workoutId) {
  const row = app.recovery[workoutId];
  if (!row) return `<section class="detail-table"><h3>Post-workout HR recovery</h3><p class="brief-sub">Missing data.</p></section>`;
  return `<section class="dialog-grid">${metric("Ending HR", bpm(row.ending_heart_rate_bpm))}${metric("One-minute HR", bpm(row.one_minute_heart_rate_bpm))}${metric("Two-minute HR", bpm(row.two_minute_heart_rate_bpm))}</section>`;
}

function compareWorkout(current, previous) {
  const currentPace = secondsPerMile(current.distance_meters, current.duration_seconds);
  const previousPace = secondsPerMile(previous.distance_meters, previous.duration_seconds);
  const paceDiff = currentPace && previousPace ? Math.round(currentPace - previousPace) : null;
  const hrDiff = numberOrNull(current.average_heart_rate_bpm) !== null && numberOrNull(previous.average_heart_rate_bpm) !== null
    ? Math.round(Number(current.average_heart_rate_bpm) - Number(previous.average_heart_rate_bpm))
    : null;
  const parts = [];
  if (paceDiff !== null) parts.push(`${Math.abs(paceDiff)} sec/${app.unit} ${paceDiff <= 0 ? "faster" : "slower"}`);
  if (hrDiff !== null) parts.push(`${Math.abs(hrDiff)} BPM ${hrDiff <= 0 ? "lower" : "higher"} avg HR`);
  return parts.length ? `Compared with a similar workout on ${formatDate(previous.started_at)}: ${parts.join(", ")}.` : "Comparable workout found, but comparison metrics are missing.";
}

function zonePercent(workoutId, zoneNumber) {
  const zone = zonePercentages(app.zones[workoutId] || []).find((candidate) => Number(candidate.zone_number) === zoneNumber);
  return zone?.percentage ?? null;
}

function intervalSummary(intervals) {
  const ratio = workRecoveryRatio(intervals);
  const workCount = intervals.filter((interval) => interval.interval_type === "work").length;
  const recoveryCount = intervals.filter((interval) => interval.interval_type === "recovery").length;
  const description = ratio.ratio === null
    ? "No work/recovery interval data for this workout."
    : `${workCount} work segment${workCount === 1 ? "" : "s"}, ${recoveryCount} recovery segment${recoveryCount === 1 ? "" : "s"}.`;
  return { ...ratio, workCount, recoveryCount, description };
}

function zoneBounds(zone) {
  const lower = numberOrNull(zone.lower_bound_bpm);
  const upper = numberOrNull(zone.upper_bound_bpm);
  if (lower === null && upper === null) return "Bounds missing";
  if (upper === null) return `${Math.round(lower)}-max BPM`;
  return `${Math.round(lower || 0)}-${Math.round(upper)} BPM`;
}

function exactWorkoutSplits(workout, intervals) {
  const unitMeters = app.unit === "km" ? 1000 : 1609.344;
  const source = intervals.some((interval) => Number(interval.distance_meters) > 0)
    ? intervals.slice().sort((a, b) => Number(a.interval_number) - Number(b.interval_number))
    : app.splits[workout.id] || [];
  const totalSourceSeconds = source.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
  const durationScale = totalSourceSeconds && workout.duration_seconds ? Number(workout.duration_seconds) / totalSourceSeconds : 1;
  const splits = [];
  let splitDistance = 0;
  let splitDuration = 0;
  let hrWeighted = 0;
  let hrSeconds = 0;

  for (const row of source) {
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
        splits.push(makeSplit(splits.length + 1, splitDistance, splitDuration, hrWeighted, hrSeconds));
        splitDistance = 0;
        splitDuration = 0;
        hrWeighted = 0;
        hrSeconds = 0;
      }
    }
  }

  if (splitDistance > 1 || splitDuration > 1) {
    splits.push(makeSplit(splits.length + 1, splitDistance, splitDuration, hrWeighted, hrSeconds));
  }
  return splits;
}

function makeSplit(number, distanceMeters, durationSeconds, hrWeighted, hrSeconds) {
  return {
    split_number: number,
    distance_meters: distanceMeters,
    duration_seconds: durationSeconds,
    average_heart_rate_bpm: hrSeconds ? hrWeighted / hrSeconds : null
  };
}

function workIntervalPace(workout) {
  const intervals = (app.intervals[workout.id] || []).filter((interval) => interval.interval_type === "work");
  const meters = intervals.reduce((sum, interval) => sum + Number(interval.distance_meters || 0), 0);
  const seconds = intervals.reduce((sum, interval) => sum + Number(interval.duration_seconds || 0), 0);
  const pace = paceSeconds(meters, seconds, app.unit);
  return pace ? pace / 60 : null;
}

function paceMinutes(workout) {
  const pace = paceSeconds(workout.distance_meters, workout.duration_seconds, app.unit);
  return pace ? pace / 60 : null;
}

function distanceValue(meters) {
  if (!Number.isFinite(Number(meters))) return null;
  return app.unit === "km" ? Number(meters) / 1000 : Number(meters) / 1609.344;
}

function intervalHr(workoutId, type) {
  const values = (app.intervals[workoutId] || []).filter((interval) => interval.interval_type === type).map((interval) => interval.average_heart_rate_bpm);
  return roundedNumberOrNull(average(values));
}

function recoveryDrop(workoutId, minute) {
  const row = app.recovery[workoutId];
  if (!row?.ending_heart_rate_bpm) return null;
  const value = minute === 1 ? row.one_minute_heart_rate_bpm : row.two_minute_heart_rate_bpm;
  return value ? roundedNumberOrNull(Number(row.ending_heart_rate_bpm) - Number(value)) : null;
}

function formatDistanceOrMissing(meters) {
  return meters === null || meters === undefined ? "Missing" : formatDistance(Number(meters), app.unit);
}

function formatDurationOrMissing(seconds) {
  return seconds === null || seconds === undefined ? "Missing" : formatDuration(Number(seconds));
}

function bpm(value) {
  return value === null || value === undefined ? "Missing" : `${Math.round(Number(value))} BPM`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function localDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: app.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedNumberOrNull(value) {
  const number = numberOrNull(value);
  return number === null ? null : Math.round(number);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
