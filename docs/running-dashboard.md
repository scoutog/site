# Running Dashboard Setup

The running dashboard lives at `/running.html` and stays within the existing static GitHub Pages site. The frontend uses Supabase Auth, Postgres with row-level security, Supabase Edge Functions for Health Auto Export ingestion and the authenticated AI coach, and Chart.js from a CDN.

## 1. Run The Website Locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/running.html`. The dashboard remains locked until `running-config.js` contains real Supabase public values.

## 2. Create The Supabase Project

Create a new Supabase project from the Supabase dashboard. Keep the project URL and anon key handy; those are public frontend configuration values.

## 3. Apply Migrations

Install and log in to the Supabase CLI, link the project, then run:

```sh
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

This applies the migrations in `supabase/migrations`, creating private workout tables, coach conversation tables, constraints, indexes, cascading relationships, and RLS policies.

## 4. Create The Single Fixed Supabase Auth Account

In Supabase Auth, create one user account for this dashboard. Use a strong password. This password is never stored in the repository or frontend code.

## 5. Configure The Non-Secret Email Identifier

Edit `running-config.js`:

```js
authEmail: "your-fixed-dashboard-email@example.com"
```

The email is a public identifier, not a secret. The password remains private.

## 6. Configure Supabase URL And Anonymous Key

Edit `running-config.js`:

```js
supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
supabaseAnonKey: "YOUR_PUBLIC_SUPABASE_ANON_KEY"
```

These are safe for frontend use. Authorization comes from Supabase Auth plus RLS.

## 7. Set RUNNING_USER_ID

Find the fixed Auth user's UUID in Supabase Auth. Add it to the database allowlist:

```sql
insert into public.running_private_users (id)
values ('00000000-0000-0000-0000-000000000000')
on conflict (id) do nothing;
```

Store the same UUID as an Edge Function secret. Also store the same email identifier used in `running-config.js` so server-created profile rows stay readable:

```sh
supabase secrets set RUNNING_USER_ID=00000000-0000-0000-0000-000000000000
supabase secrets set RUNNING_USER_EMAIL=your-fixed-dashboard-email@example.com
```

The Edge Function never trusts a `user_id` supplied by Health Auto Export.

## 8. Create And Store The Ingestion Bearer Secret

Generate a long random token and store it server-side only:

```sh
supabase secrets set RUNNING_INGESTION_SECRET='long-random-token'
```

Also set:

```sh
supabase secrets set SUPABASE_URL='https://YOUR-PROJECT-REF.supabase.co'
supabase secrets set SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVER_SIDE_SERVICE_ROLE_KEY'
```

The service-role key and ingestion secret must never appear in `running.html`, `running-app.js`, `running-config.js`, or any production frontend asset.

## 9. Deploy The Edge Function

```sh
supabase functions deploy import-health-data
supabase functions deploy running-coach
```

The endpoint will be:

```text
https://YOUR-PROJECT-REF.supabase.co/functions/v1/import-health-data
```

The authenticated coach endpoint will be:

```text
https://YOUR-PROJECT-REF.supabase.co/functions/v1/running-coach
```

It is called by the dashboard with your logged-in Supabase session. Do not call it from Health Auto Export.

## 10. Configure Health Auto Export

In the Health Auto Export iPhone app, create an automation/export for Apple Workout running data. Choose JSON output if available.

## 11. Add The REST Endpoint

Use the Edge Function URL:

```text
https://YOUR-PROJECT-REF.supabase.co/functions/v1/import-health-data
```

Use `POST`. Do not use `GET` for imports or any mutation.

## 12. Add The Authorization Header

Add this request header in Health Auto Export:

```text
Authorization: Bearer YOUR_LONG_RANDOM_TOKEN
Content-Type: application/json
```

Only the bearer token value goes into Health Auto Export and Supabase Edge Function secrets. It does not go into the website code.

## 13. Send A Test Workout

Send one test export from Health Auto Export. The function returns concise JSON with `status`, `imported` counts, and sanitized `errors`. It does not log full payloads, bearer tokens, authorization headers, or passwords.

## 14. Import Historical Data

Use Health Auto Export's manual export flow for historical date ranges. Those exports go through the same Edge Function, are assigned to the configured user ID, and are protected by the same RLS policies.

## 15. Rotate The Ingestion Secret

Create a new long token:

```sh
supabase secrets set RUNNING_INGESTION_SECRET='new-long-random-token'
supabase functions deploy import-health-data
```

Update Health Auto Export's `Authorization` header to use the new token. Retire the old token from any password manager or notes.

## AI Coach Setup

The AI coach is private server-side functionality. Add these as Supabase Edge Function secrets only:

```sh
supabase secrets set OPENAI_API_KEY='YOUR_SERVER_SIDE_OPENAI_API_KEY'
supabase secrets set OPENAI_MODEL='gpt-5.6-terra'
supabase functions deploy running-coach
```

`OPENAI_MODEL` is optional; if unset, the function uses `gpt-5.6-terra`. If the configured model is denied or unavailable, the function tries `gpt-5-mini` and then `gpt-4.1-mini` before returning a generic coach error. The OpenAI key must never appear in `running-config.js`, `running.html`, `running-app.js`, or any production frontend asset.

The coach sends OpenAI compact derived workout summaries, recent interval trends, selected workout detail when requested, and recent coach conversation memory. It does not send `raw_imports.payload`, GPS/routes, ingestion tokens, passwords, authorization headers, or service-role keys.

If the coach drawer says “Coach is unavailable right now,” check that:

- `coach_messages` and `coach_memory` migrations have been applied.
- `running-coach` is deployed.
- `OPENAI_API_KEY` is set in Edge Function secrets.
- Your logged-in Auth user is still present in `running_private_users`.

## 16. Deploy The GitHub Pages Site

Commit and push to `master`. The existing GitHub Actions workflow deploys the repository root to GitHub Pages and preserves the custom domain from `CNAME`.

## 17. Export Or Back Up Stored Data

Back up from Supabase directly using Table Editor exports or database backups. The dashboard no longer exposes an in-page export control.

## Security Notes

- `running-config.js` contains frontend-safe public values only.
- RLS policies require `auth.uid() = user_id` for parent tables.
- Child table policies verify ownership through `workouts.user_id`.
- Coach conversation policies require `auth.uid() = user_id`; coach messages with a workout ID also verify workout ownership.
- `running_private_users` allowlists the single fixed dashboard account.
- The Edge Function uses the service-role key only server-side.
- The AI coach Edge Function uses the OpenAI API key only server-side.
- Health Auto Export payloads are stored in `raw_imports` for auditing and normalized idempotently into relational tables.
- Duplicate prevention uses `raw_imports(user_id, payload_hash)` and `workouts(user_id, source, source_workout_id)`.
- The parser ignores GPS route data in version 1.
- Deleting an import from the dashboard also deletes workouts normalized from that import.
- GitHub Pages cannot set arbitrary HTTP security headers such as `Strict-Transport-Security`, `X-Frame-Options`, or server-level CSP. `running.html` uses a CSP meta tag and a strict referrer policy where static HTML allows it. If you later proxy through Cloudflare or another host, set equivalent response headers there.

## Adapter Assumptions

The Health Auto Export adapter accepts several likely field names for workouts, splits, intervals, zones, and recovery. It is intentionally isolated in `supabase/functions/import-health-data/adapter.js` so it can be updated after you provide a real export sample.
