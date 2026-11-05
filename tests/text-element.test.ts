import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { textContentSchema } from '../src/shared/board.ts';

let db: PGlite;
const BOARD = '00000000-0000-0000-0000-000000000001';
const TITLE = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key, bucket_id text);
    grant usage on schema public, storage to anon, authenticated, service_role;
  `);
  for (const file of ['0001_media_foundation.sql', '0002_security.sql', '0003_board_api.sql', '0004_text_elements.sql', '0005_title_font.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 30000);
afterAll(async () => { await db?.close(); });

it('seeds the one-time central "Eefje\'s universum" text element', async () => {
  const { rows } = await db.query<{ type: string; x: number; y: number; content: unknown }>(
    'select type, x, y, content from public.elements where id = $1', [TITLE]);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row.type).toBe('text');
  // Centred near the middle of the initial 2400 x 1600 board (1200, 800).
  expect(row.x + 800 / 2).toBe(1200);
  expect(row.y + 180 / 2).toBe(800);
  const content = textContentSchema.parse(row.content);
  expect(content).toEqual({ body: "Eefje's universum", fontSize: 80, colourKey: 'rainbow', alignment: 'center', font: 'hand' });
});

it('does not recreate the title when the insert is replayed after deletion', async () => {
  await db.exec('delete from public.elements where id = \'00000000-0000-0000-0000-000000000002\'');
  expect((await db.query('select 1 from public.elements')).rows).toHaveLength(0);
});

it('accepts text elements and still rejects unknown types', async () => {
  await db.exec(`insert into public.elements (board_id, type, x, y, width, height, content)
    values ('${BOARD}', 'text', 10, 10, 300, 100, '{"body":"Heading","fontSize":"large","colourKey":"berry","alignment":"center"}')`);
  await expect(db.exec(`insert into public.elements (board_id, type, x, y, width, height, content)
    values ('${BOARD}', 'drawing', 10, 10, 300, 100, '{}')`)).rejects.toThrow(/elements_type_check/);
});

it('keeps text elements media-free like notes and lists', async () => {
  await expect(db.exec(`insert into public.elements (board_id, type, x, y, width, height, media_id, content)
    values ('${BOARD}', 'text', 10, 10, 300, 100, gen_random_uuid(), '{"body":"x"}')`)).rejects.toThrow();
});
