-- Phase 1 foundation: boards seed, media_assets table, private buckets.
-- RLS is enabled with no policies: only the service role (backend) can read/write.

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  min_width integer not null default 2400 check (min_width > 0),
  min_height integer not null default 1600 check (min_height > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards (id) on delete cascade,
  staging_key text,
  storage_key text,
  declared_mime_type text,
  declared_byte_size bigint check (declared_byte_size is null or declared_byte_size > 0),
  mime_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size bigint check (byte_size is null or byte_size > 0),
  status text not null default 'staging' check (status in ('staging', 'ready', 'rejected', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_board_idx on media_assets (board_id);
create index if not exists media_assets_status_idx on media_assets (status);

alter table boards enable row level security;
alter table media_assets enable row level security;

-- Seed board used by the phase-1 prototype. Id is referenced server-side.
insert into boards (id, title)
values ('00000000-0000-0000-0000-000000000001', 'Eefje''s universum')
on conflict (id) do nothing;

-- Private storage buckets: no public access, no client policies.
insert into storage.buckets (id, name, public)
values ('media-staging', 'media-staging', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
