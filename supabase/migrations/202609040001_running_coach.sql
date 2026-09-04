create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  scope text not null default 'dashboard' check (scope in ('dashboard', 'workout')),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_memory (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  summary text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists coach_messages_user_created_at_idx
  on public.coach_messages (user_id, created_at desc);

create index if not exists coach_messages_workout_id_idx
  on public.coach_messages (workout_id);

grant select, insert, update, delete on public.coach_messages to authenticated, service_role;
grant select, insert, update, delete on public.coach_memory to authenticated, service_role;

drop trigger if exists coach_memory_set_updated_at on public.coach_memory;
create trigger coach_memory_set_updated_at before update on public.coach_memory
for each row execute function public.set_updated_at();

alter table public.coach_messages enable row level security;
alter table public.coach_memory enable row level security;

create policy "coach messages owner select" on public.coach_messages
  for select using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "coach messages owner insert" on public.coach_messages
  for insert with check (
    auth.uid() = user_id
    and public.running_is_private_user(auth.uid())
    and (
      workout_id is null
      or exists (
        select 1
        from public.workouts w
        where w.id = workout_id
          and w.user_id = auth.uid()
          and public.running_is_private_user(auth.uid())
      )
    )
  );

create policy "coach messages owner update" on public.coach_messages
  for update using (
    auth.uid() = user_id
    and public.running_is_private_user(auth.uid())
  ) with check (
    auth.uid() = user_id
    and public.running_is_private_user(auth.uid())
    and (
      workout_id is null
      or exists (
        select 1
        from public.workouts w
        where w.id = workout_id
          and w.user_id = auth.uid()
          and public.running_is_private_user(auth.uid())
      )
    )
  );

create policy "coach messages owner delete" on public.coach_messages
  for delete using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "coach memory owner select" on public.coach_memory
  for select using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "coach memory owner insert" on public.coach_memory
  for insert with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "coach memory owner update" on public.coach_memory
  for update using (auth.uid() = user_id and public.running_is_private_user(auth.uid()))
  with check (auth.uid() = user_id and public.running_is_private_user(auth.uid()));

create policy "coach memory owner delete" on public.coach_memory
  for delete using (auth.uid() = user_id and public.running_is_private_user(auth.uid()));
