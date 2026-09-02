import { normalizeHealthAutoExportPayload } from "./adapter.js";

const MAX_PAYLOAD_BYTES = 1_000_000;

export function createImportHandler({ env, supabaseFactory, hashPayload = sha256Hex }) {
  return async function handleImport(request) {
    try {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const authHeader = request.headers.get("authorization") || "";
      const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
      if (!token || !secureTokenEqual(token, env.RUNNING_INGESTION_SECRET || "")) {
        return json({ error: "Unauthorized" }, 401);
      }

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return json({ error: "Unsupported content type" }, 415);
      }

      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_PAYLOAD_BYTES) {
        return json({ error: "Payload too large" }, 413);
      }

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

      const userId = env.RUNNING_USER_ID;
      if (!userId) return json({ error: "Import target is not configured" }, 500);

      const payloadHash = await hashPayload(bodyText);
      const parsed = normalizeHealthAutoExportPayload(payload, { source: "health_auto_export" });
      const sourceIdentifier = payload.exportIdentifier || payload.export_id || payload.source || "health_auto_export";
      const supabase = supabaseFactory();
      await ensureImportProfile(supabase, userId, env.RUNNING_USER_EMAIL || "running-dashboard@local.invalid");

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
          source_identifier: String(sourceIdentifier),
          payload,
          payload_hash: payloadHash,
          status: importStatus,
          error_summary: parsed.errors.map((error) => error.message).slice(0, 5).join("; ") || null
        }, { onConflict: "user_id,payload_hash" })
        .select("id")
        .single();

      if (rawError) {
        return json({ status: "failed", imported: 0, errors: ["Unable to record import."] }, 500);
      }

      const counts = { workouts: 0, splits: 0, intervals: 0, zones: 0, recovery: 0 };
      const upsertErrors = [];

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
        } catch (error) {
          upsertErrors.push(error.message || "Workout import failed.");
        }
      }

      const allErrors = [...parsed.errors.map((error) => error.message), ...upsertErrors].slice(0, 8);
      const status = allErrors.length && counts.workouts ? "partially_succeeded" : allErrors.length ? "failed" : "succeeded";

      if (status !== importStatus) {
        await supabase
          .from("raw_imports")
          .update({ status, error_summary: allErrors.join("; ") || null })
          .eq("id", rawImport.id);
      }

      return json({ status, imported: counts, errors: allErrors });
    } catch (_error) {
      return json({ status: "failed", imported: 0, errors: ["Import failed."] }, 500);
    }
  };
}

async function ensureImportProfile(supabase, userId, email) {
  await supabase.from("running_private_users").upsert({ id: userId }, { onConflict: "id" });
  await supabase.from("profiles").upsert({
    id: userId,
    email,
    timezone: "America/New_York",
    preferred_distance_unit: "mi",
    minimum_counted_workout_seconds: 600
  }, { onConflict: "id" });
}

async function upsertWorkoutTree(supabase, userId, importId, workout) {
  const { splits, intervals, zones, recovery, ...workoutRow } = workout;
  const { data, error } = await supabase
    .from("workouts")
    .upsert({
      ...workoutRow,
      user_id: userId,
      import_id: importId
    }, { onConflict: "user_id,source,source_workout_id" })
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

  if (splits.length) {
    const { error } = await supabase.from("workout_splits").insert(splits.map((row) => ({ ...row, workout_id: workoutId })));
    if (error) throw new Error("Unable to insert workout splits.");
  }

  if (intervals.length) {
    const { error } = await supabase.from("workout_intervals").insert(intervals.map((row) => ({ ...row, workout_id: workoutId })));
    if (error) throw new Error("Unable to insert workout intervals.");
  }

  if (zones.length) {
    const { error } = await supabase.from("heart_rate_zones").insert(zones.map((row) => ({ ...row, workout_id: workoutId })));
    if (error) throw new Error("Unable to insert heart-rate zones.");
  }

  if (recovery) {
    const { error } = await supabase.from("heart_rate_recovery").insert({ ...recovery, workout_id: workoutId });
    if (error) throw new Error("Unable to insert heart-rate recovery.");
  }

  return workoutId;
}

export function secureTokenEqual(left, right) {
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

export async function sha256Hex(text) {
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
