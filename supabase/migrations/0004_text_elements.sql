-- Phase 5: standalone text elements (section 9.1) and the one-time central
-- board title. The insert runs once with the migrations; a fixed id keeps it
-- idempotent on replay without ever recreating a user-deleted title.

alter table public.elements drop constraint elements_type_check;
alter table public.elements add constraint elements_type_check
  check (type in ('note', 'image', 'list', 'text'));

-- "Eefje's universum", centred near the middle of the initial 2400 x 1600
-- board (centre 1200, 800). It stays an ordinary editable/movable element.
insert into public.elements (id, board_id, type, x, y, width, height, z_index, content)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'text',
  800, 710, 800, 180, 0,
  '{"body": "Eefje''s universum", "fontSize": "xlarge", "colourKey": "ink", "alignment": "center"}'::jsonb
)
on conflict (id) do nothing;
