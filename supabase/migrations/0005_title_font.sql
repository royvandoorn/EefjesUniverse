-- Phase 5 polish: restyle the central "Eefje's universum" text element to the
-- handwritten centerpiece look (font + numeric size + colour from the wider
-- palette). Re-added if missing; restyled only while it still carries its
-- untouched seeded content, so user edits are never clobbered. It remains an
-- ordinary movable/editable element.

insert into public.elements (id, board_id, type, x, y, width, height, z_index, content)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'text',
  800, 710, 800, 180, 0,
  '{"body": "Eefje''s universum", "fontSize": 80, "colourKey": "rainbow", "alignment": "center", "font": "hand"}'::jsonb
)
on conflict (id) do nothing;

update public.elements
set content = '{"body": "Eefje''s universum", "fontSize": 80, "colourKey": "rainbow", "alignment": "center", "font": "hand"}'::jsonb
where id = '00000000-0000-0000-0000-000000000002'
  and type = 'text'
  and content = '{"body": "Eefje''s universum", "fontSize": "xlarge", "colourKey": "ink", "alignment": "center"}'::jsonb;
