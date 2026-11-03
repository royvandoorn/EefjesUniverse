create table public.access_credentials (
  role text primary key check (role in ('viewer', 'editor')),
  password_hash text not null check (password_hash like '$argon2id$%'),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  token_digest text primary key check (token_digest ~ '^[a-f0-9]{64}$'),
  role text not null references public.access_credentials(role),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_expiry_idx on public.sessions(expires_at);

create table public.login_throttles (
  key text primary key,
  window_start timestamptz not null,
  counter integer not null check (counter > 0),
  blocked_until timestamptz
);

create function public.consume_login_attempt(source_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare attempts integer;
begin
  insert into public.login_throttles as t (key, window_start, counter)
  values (source_key, now(), 1)
  on conflict (key) do update set
    window_start = case when t.window_start <= now() - interval '15 minutes' then now() else t.window_start end,
    counter = case when t.window_start <= now() - interval '15 minutes' then 1 else least(t.counter + 1, 6) end,
    blocked_until = case when t.window_start <= now() - interval '15 minutes' then null
      when t.counter >= 4 then t.window_start + interval '15 minutes' else null end
  returning counter into attempts;
  return attempts <= 5;
end;
$$;

create function public.rotate_password(target_role text, new_hash text, other_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(8142026);
  if target_role not in ('viewer', 'editor') or new_hash not like '$argon2id$%' then
    raise exception 'Invalid credential';
  end if;
  if (select password_hash from public.access_credentials where role <> target_role) is distinct from other_hash then
    raise exception 'Credentials changed; retry administration';
  end if;
  insert into public.access_credentials(role, password_hash) values (target_role, new_hash)
  on conflict (role) do update set password_hash = excluded.password_hash, updated_at = now();
  delete from public.sessions where role = target_role;
end;
$$;

create function public.create_session(session_digest text, session_role text, expected_hash text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare expiry timestamptz := now() + interval '7 days';
begin
  perform pg_advisory_xact_lock(8142026);
  if not exists (select 1 from public.access_credentials where role = session_role and password_hash = expected_hash) then
    raise exception 'Credentials changed';
  end if;
  insert into public.sessions(token_digest, role, expires_at) values (session_digest, session_role, expiry);
  return expiry;
end;
$$;

create table public.visual_groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  colour_key text not null check (length(colour_key) between 1 and 40),
  x integer not null check (x between 0 and 12000),
  y integer not null check (y between 0 and 12000),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  unique (id, board_id)
);
create index visual_groups_board_idx on public.visual_groups(board_id);

alter table public.media_assets add unique (id, board_id);
create table public.elements (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  type text not null check (type in ('note', 'image', 'list')),
  x integer not null check (x between 0 and 12000),
  y integer not null check (y between 0 and 12000),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  z_index integer not null default 0,
  group_id uuid,
  media_id uuid,
  revision integer not null default 1 check (revision > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id, board_id) references public.visual_groups(id, board_id) on delete set null (group_id),
  foreign key (media_id, board_id) references public.media_assets(id, board_id),
  check ((type = 'image' and media_id is not null and coalesce(content->>'mediaId' = media_id::text, false))
    or (type <> 'image' and media_id is null))
);
create index elements_board_idx on public.elements(board_id);
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references public.elements(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 500),
  completed boolean not null default false,
  position integer not null check (position >= 0),
  unique (element_id, position) deferrable initially deferred
);

alter table public.access_credentials enable row level security;
alter table public.sessions enable row level security;
alter table public.login_throttles enable row level security;
alter table public.visual_groups enable row level security;
alter table public.elements enable row level security;
alter table public.list_items enable row level security;
revoke all on public.access_credentials, public.sessions, public.login_throttles,
  public.boards, public.media_assets, public.visual_groups, public.elements, public.list_items from anon, authenticated;
grant all on public.access_credentials, public.sessions, public.login_throttles,
  public.boards, public.media_assets, public.visual_groups, public.elements, public.list_items to service_role;
revoke all on function public.consume_login_attempt(text), public.rotate_password(text,text,text), public.create_session(text,text,text) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text), public.rotate_password(text,text,text), public.create_session(text,text,text) to service_role;

insert into storage.buckets (id, name, public) values ('media', 'media', false), ('media-staging', 'media-staging', false)
on conflict (id) do update set public = false;

create policy private_scrapbook_storage on storage.objects as restrictive for all to anon, authenticated
using (bucket_id not in ('media', 'media-staging'))
with check (bucket_id not in ('media', 'media-staging'));
