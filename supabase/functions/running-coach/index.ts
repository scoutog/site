import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCoachHandler } from "./handler.js";

const handler = createCoachHandler({
  env: {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
    OPENAI_MODEL: Deno.env.get("OPENAI_MODEL")
  },
  supabaseFactory(authorization: string) {
    return createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      getPublicSupabaseKey(),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            authorization,
            "x-application-name": "scout-running-coach"
          }
        }
      }
    );
  }
});

serve(handler);

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
