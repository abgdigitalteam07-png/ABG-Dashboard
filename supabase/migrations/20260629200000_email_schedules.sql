-- Email report schedules table
create table if not exists public.email_schedules (
  id            uuid primary key default gen_random_uuid(),
  brand_id      text not null,
  brand_name    text not null,
  recipients    text[] not null default '{}',
  day_of_week   smallint not null default 1,  -- 0=Sun 1=Mon … 6=Sat
  send_hour_utc smallint not null default 8,  -- 0–23
  date_range_days int not null default 7,     -- 7, 14, 30, 60, 90
  is_active     boolean not null default true,
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    text
);

alter table public.email_schedules enable row level security;

-- Only admins can read/write schedules
create policy "admins_all_schedules" on public.email_schedules
  for all using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger email_schedules_updated_at
  before update on public.email_schedules
  for each row execute function public.set_updated_at();
