create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  timezone text not null default 'America/New_York',
  preferred_distance_unit text not null default 'mi' check (preferred_distance_unit in ('mi', 'km')),
  minimum_counted_workout_seconds integer not null default 600 check (minimum_counted_workout_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.running_private_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  source_identifier text,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  payload_hash text not null,
  status text not null check (status in ('succeeded', 'partially_succeeded', 'failed')),
  error_summary text
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  source_workout_id text not null,
  workout_type text not null default 'running',
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null check (duration_seconds >= 0),
  distance_meters numeric(10,2) check (distance_meters >= 0),
  active_energy_kcal numeric(10,2) check (active_energy_kcal >= 0),
  total_energy_kcal numeric(10,2) check (total_energy_kcal >= 0),
  elevation_gain_meters numeric(10,2) check (elevation_gain_meters >= 0),
  average_heart_rate_bpm numeric(6,2) check (average_heart_rate_bpm >= 0),
  minimum_heart_rate_bpm numeric(6,2) check (minimum_heart_rate_bpm >= 0),
  maximum_heart_rate_bpm numeric(6,2) check (maximum_heart_rate_bpm >= 0),
  average_speed_mps numeric(8,4) check (average_speed_mps >= 0),
  average_power_watts numeric(8,2) check (average_power_watts >= 0),
  perceived_effort text,
  notes text,
  import_id uuid references public.raw_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_splits (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  split_number integer not null check (split_number > 0),
  distance_meters numeric(10,2) check (distance_meters >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  average_heart_rate_bpm numeric(6,2) check (average_heart_rate_bpm >= 0),
  average_power_watts numeric(8,2) check (average_power_watts >= 0),
  unique (workout_id, split_number)
);

create table if not exists public.workout_intervals (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  interval_number integer not null check (interval_number > 0),
  interval_type text not null default 'unknown' check (interval_type in ('warmup', 'work', 'recovery', 'cooldown', 'unknown')),
  distance_meters numeric(10,2) check (distance_meters >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  average_heart_rate_bpm numeric(6,2) check (average_heart_rate_bpm >= 0),
  average_power_watts numeric(8,2) check (average_power_watts >= 0),
  unique (workout_id, interval_number)
);

create table if not exists public.heart_rate_zones (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  zone_number integer not null check (zone_number between 1 and 5),
  lower_bound_bpm integer not null check (lower_bound_bpm >= 0),
  upper_bound_bpm integer check (upper_bound_bpm is null or upper_bound_bpm >= lower_bound_bpm),
  duration_seconds integer not null check (duration_seconds >= 0),
  unique (workout_id, zone_number)
);

create table if not exists public.heart_rate_recovery (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null unique references public.workouts(id) on delete cascade,
  ending_heart_rate_bpm numeric(6,2) check (ending_heart_rate_bpm >= 0),
  one_minute_heart_rate_bpm numeric(6,2) check (one_minute_heart_rate_bpm >= 0),
  two_minute_heart_rate_bpm numeric(6,2) check (two_minute_heart_rate_bpm >= 0)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_type text not null default 'workout_count',
  target_value numeric(12,2) not null check (target_value >= 0),
  minimum_workout_seconds integer not null default 600 check (minimum_workout_seconds >= 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create unique index if not exists workouts_user_source_identifier_idx
  on public.workouts (user_id, source, source_workout_id);

create unique index if not exists raw_imports_user_payload_hash_idx
  on public.raw_imports (user_id, payload_hash);

create index if not exists workouts_user_started_at_idx on public.workouts (user_id, started_at desc);
create index if not exists workouts_import_id_idx on public.workouts (import_id);
create index if not exists splits_workout_id_idx on public.workout_splits (workout_id);
create index if not exists intervals_workout_id_idx on public.workout_intervals (workout_id);
create index if not exists zones_workout_id_idx on public.heart_rate_zones (workout_id);
create index if not exists raw_imports_user_received_at_idx on public.raw_imports (user_id, received_at desc);
create index if not exists goals_user_status_idx on public.goals (user_id, status);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select on public.running_private_users to authenticated, service_role;
grant insert, update on public.running_private_users to service_role;
grant select, insert, update, delete on public.raw_imports to authenticated, service_role;
grant select, insert, update, delete on public.workouts to authenticated, service_role;
grant select, insert, update, delete on public.workout_splits to authenticated, service_role;
grant select, insert, update, delete on public.workout_intervals to authenticated, service_role;
grant select, insert, update, delete on public.heart_rate_zones to authenticated, service_role;
grant select, insert, update, delete on public.heart_rate_recovery to authenticated, service_role;
grant select, insert, update, delete on public.goals to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.running_is_private_user(candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.running_private_users
    where id = candidate
  );
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists workouts_set_updated_at on public.workouts;
create trigger workouts_set_updated_at before update on public.workouts
for each row execute function public.set_updated_at();

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.running_private_users enable row level security;
alter table public.raw_imports enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_splits enable row level security;
alter table public.workout_intervals enable row level security;
alter table public.heart_rate_zones enable row level security;
alter table public.heart_rate_recovery enable row level security;
alter table public.goals enable row level security;

create policy "profiles owner select" on public.profiles
  for select using (auth.uid() = id and public.running_is_private_user(auth.uid()));
create policy "profiles owner insert" on public.profiles
  for insert with check (auth.uid() = id and public.running_is_private_user(auth.uid()));
create policy "profiles owner update" on public.profiles
  for update using (auth.uid() = id and public.running_is_private_user(auth.uid()))
  with check (auth.uid() = id and public.running_is_private_user(auth.uid()));

create policy "private users owner select" on public.running_private_users
  for select using (auth.uid() = id);

create policy "raw imports owner select" on public.raw_imports
  for select using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "raw imports owner insert" on public.raw_imports
  for insert with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "raw imports owner update" on public.raw_imports
  for update using (auth.uid() = user_id and public.running_is_private_user(auth.uid()))
  with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "raw imports owner delete" on public.raw_imports
  for delete using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "workouts owner select" on public.workouts
  for select using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "workouts owner insert" on public.workouts
  for insert with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "workouts owner update" on public.workouts
  for update using (auth.uid() = user_id and public.running_is_private_user(auth.uid()))
  with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "workouts owner delete" on public.workouts
  for delete using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "splits owner select" on public.workout_splits
  for select using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "splits owner insert" on public.workout_splits
  for insert with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "splits owner update" on public.workout_splits
  for update using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  )) with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "splits owner delete" on public.workout_splits
  for delete using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));

create policy "intervals owner select" on public.workout_intervals
  for select using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "intervals owner insert" on public.workout_intervals
  for insert with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "intervals owner update" on public.workout_intervals
  for update using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  )) with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "intervals owner delete" on public.workout_intervals
  for delete using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));

create policy "zones owner select" on public.heart_rate_zones
  for select using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "zones owner insert" on public.heart_rate_zones
  for insert with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "zones owner update" on public.heart_rate_zones
  for update using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  )) with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "zones owner delete" on public.heart_rate_zones
  for delete using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));

create policy "recovery owner select" on public.heart_rate_recovery
  for select using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "recovery owner insert" on public.heart_rate_recovery
  for insert with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "recovery owner update" on public.heart_rate_recovery
  for update using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  )) with check (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));
create policy "recovery owner delete" on public.heart_rate_recovery
  for delete using (exists (
    select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid() and public.running_is_private_user(auth.uid())
  ));

create policy "goals owner select" on public.goals
  for select using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "goals owner insert" on public.goals
  for insert with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "goals owner update" on public.goals
  for update using (auth.uid() = user_id and public.running_is_private_user(auth.uid()))
  with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
create policy "goals owner delete" on public.goals
  for delete using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
