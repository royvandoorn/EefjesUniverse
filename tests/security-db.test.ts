import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';

let db: PGlite;
const tables = ['boards', 'media_assets', 'access_credentials', 'sessions', 'login_throttles', 'elements', 'list_items', 'visual_groups'];
const viewerHash = '$argon2id$synthetic-viewer';
const editorHash = '$argon2id$synthetic-editor';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key, bucket_id text);
    alter table storage.objects enable row level security;
    grant usage on schema public, storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated;
  `);
  for (const file of ['0001_media_foundation.sql', '0002_security.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30000);
afterAll(async () => { await db?.close(); });

it('enables RLS and removes browser table privileges for every application table', async () => {
  for (const table of tables) {
    const { rows } = await db.query<{ rls: boolean; access: boolean }>(
      `select relrowsecurity as rls, has_table_privilege('anon', oid, 'SELECT') or
       has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE') as access
       from pg_class where oid = $1::regclass`, [`public.${table}`]);
    expect(rows[0]).toEqual({ rls: true, access: false });
  }
});
it('denies browser execution of privileged functions', async () => {
  for (const fn of ['consume_login_attempt(text)', 'rotate_password(text,text,text)', 'create_session(text,text,text)']) {
    const { rows } = await db.query<{ denied: boolean; allowed: boolean }>(
      `select not has_function_privilege('anon', $1, 'EXECUTE') and
       not has_function_privilege('authenticated', $1, 'EXECUTE') as denied,
       has_function_privilege('service_role', $1, 'EXECUTE') as allowed`, [`public.${fn}`]);
    expect(rows[0]).toEqual({ denied: true, allowed: true });
  }
});
it('keeps buckets private and rejects browser object access even with a broad permissive policy', async () => {
  expect((await db.query<{ public: boolean }>('select public from storage.buckets')).rows).toEqual([{ public: false }, { public: false }]);
  await db.exec(`create policy unrelated_permissive_policy on storage.objects for all to anon, authenticated using (true) with check (true);
    insert into storage.objects values (gen_random_uuid(), 'media'), (gen_random_uuid(), 'media-staging');`);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      expect((await db.query('select * from storage.objects')).rows).toEqual([]);
      await expect(db.exec(`insert into storage.objects values (gen_random_uuid(), 'media')`)).rejects.toThrow(/row-level security/);
    } finally { await db.exec('reset role'); }
  }
});
it('atomically limits each address to five attempts per fifteen minute window', async () => {
  for (let i = 1; i <= 7; i++) {
    const { rows } = await db.query<{ allowed: boolean }>(`select public.consume_login_attempt('source-a') as allowed`);
    expect(rows[0].allowed).toBe(i <= 5);
  }
  expect((await db.query<{ allowed: boolean }>(`select public.consume_login_attempt('source-b') as allowed`)).rows[0].allowed).toBe(true);
  await db.exec(`update public.login_throttles set window_start = now() - interval '16 minutes' where key = 'source-a'`);
  expect((await db.query<{ allowed: boolean }>(`select public.consume_login_attempt('source-a') as allowed`)).rows[0].allowed).toBe(true);
});
it('rotates only the selected role, revokes its sessions, and prevents stale-hash session creation', async () => {
  await db.query('select public.rotate_password($1,$2,$3)', ['viewer', viewerHash, null]);
  await db.query('select public.rotate_password($1,$2,$3)', ['editor', editorHash, viewerHash]);
  await db.query('select public.create_session($1,$2,$3)', ['a'.repeat(64), 'viewer', viewerHash]);
  await db.query('select public.create_session($1,$2,$3)', ['b'.repeat(64), 'editor', editorHash]);
  const expiry = (await db.query<{ expires_at: Date }>(`select expires_at from public.sessions where role = 'viewer'`)).rows[0].expires_at;
  expect(new Date(expiry).getTime() - Date.now()).toBeGreaterThan(6.99 * 86400000);
  await db.query('select public.rotate_password($1,$2,$3)', ['viewer', '$argon2id$rotated', editorHash]);
  expect((await db.query('select role from public.sessions')).rows).toEqual([{ role: 'editor' }]);
  await expect(db.query('select public.create_session($1,$2,$3)', ['c'.repeat(64), 'viewer', viewerHash])).rejects.toThrow('Credentials changed');
  await expect(db.query('select public.rotate_password($1,$2,$3)', ['editor', '$argon2id$another', viewerHash])).rejects.toThrow('Credentials changed');
});
it('enforces same-board group and media references', async () => {
  await db.exec(`insert into public.boards(id,title) values ('00000000-0000-0000-0000-000000000002','Test');
    insert into public.visual_groups(id,board_id,name,colour_key,x,y,width,height)
    values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Test','paper',0,0,100,100)`);
  await expect(db.exec(`insert into public.elements(board_id,type,x,y,width,height,group_id,content)
    values ('00000000-0000-0000-0000-000000000001','note',0,0,100,100,'00000000-0000-0000-0000-000000000003','{}')`)).rejects.toThrow(/foreign key/);
  await expect(db.exec(`insert into public.elements(board_id,type,x,y,width,height,media_id,content)
    values ('00000000-0000-0000-0000-000000000001','image',0,0,100,100,null,'{}')`)).rejects.toThrow(/check constraint/);
});
