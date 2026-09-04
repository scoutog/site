import { buildCoachContext } from "./coach-context.js";

const MAX_BODY_BYTES = 20_000;
const MAX_QUESTION_CHARS = 2000;
const GENERIC_ERROR = "Coach is unavailable right now.";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-running-access-token",
  "access-control-max-age": "86400"
};

export function createCoachHandler({ env, supabaseFactory, openAIResponder = createOpenAIResponder() }) {
  return async function handleCoach(request) {
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
        return json({ error: "Authentication required" }, 401);
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

      const supabase = supabaseFactory(userAuthorization);
      const { data: userData, error: userError } = await supabase.auth.getUser(userToken);
      const user = userData?.user;
      if (userError || !user?.id) {
        return json({ error: "Authentication required" }, 401);
      }

      const privateUser = await single(supabase.from("running_private_users").select("id").eq("id", user.id));
      if (!privateUser.data) {
        return json({ error: "Authentication required" }, 403);
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
      const answer = await openAIResponder({ env, question, context });
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
  };
}

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

export function createOpenAIResponder(fetchImpl = fetch) {
  return async function respondWithOpenAI({ env, question, context }) {
    if (!env.OPENAI_API_KEY) throw new Error("openai_not_configured");
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
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
  };
}

export function extractResponseText(data) {
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
