-- Shared records for the class hub.
-- Run once in Supabase Dashboard > SQL Editor before expecting cloud sync.

create extension if not exists pgcrypto;

create table if not exists public.class_hub_records (
  id uuid primary key default gen_random_uuid(),
  record_key text not null unique
    check (char_length(record_key) between 3 and 120),
  record_type text not null
    check (record_type in ('post', 'team', 'suggestion', 'deadline')),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  visitor_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'published'
    check (status in ('published', 'hidden')),
  created_at timestamptz not null default now()
);

alter table public.class_hub_records
  add column if not exists author_id uuid references auth.users(id) on delete set null;

create index if not exists class_hub_records_visible_idx
  on public.class_hub_records (status, created_at desc);

create or replace function public.enforce_class_hub_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.class_hub_records
    where visitor_id = new.visitor_id
      and created_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception '发布得有点快，请稍后再试。';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_class_hub_rate_limit
  on public.class_hub_records;
create trigger enforce_class_hub_rate_limit
  before insert on public.class_hub_records
  for each row execute procedure public.enforce_class_hub_rate_limit();

alter table public.class_hub_records enable row level security;

drop policy if exists "published class records are public"
  on public.class_hub_records;
create policy "published class records are public"
  on public.class_hub_records for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "visitors can publish class content"
  on public.class_hub_records;
create policy "visitors can publish class content"
  on public.class_hub_records for insert
  to anon, authenticated
  with check (
    status = 'published'
    and record_type in ('post', 'team', 'suggestion', 'deadline')
    and char_length(record_key) between 3 and 120
    and jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 32768
    and visitor_id is not null
    and (author_id is null or author_id = auth.uid())
  );

grant usage on schema public to anon, authenticated;
grant select, insert on public.class_hub_records to anon, authenticated;
grant execute on function public.enforce_class_hub_rate_limit()
  to anon, authenticated;
