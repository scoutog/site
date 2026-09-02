import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createImportHandler } from "./handler.js";

const handler = createImportHandler({
  env: {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    RUNNING_USER_ID: Deno.env.get("RUNNING_USER_ID"),
    RUNNING_USER_EMAIL: Deno.env.get("RUNNING_USER_EMAIL"),
    RUNNING_INGESTION_SECRET: Deno.env.get("RUNNING_INGESTION_SECRET")
  },
  supabaseFactory() {
    return createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getServerSupabaseKey(),
      {
        auth: { persistSession: false },
        global: { headers: { "x-application-name": "scout-running-import" } }
      }
    );
  }
});

serve(handler);

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
