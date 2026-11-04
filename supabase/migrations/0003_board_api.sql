-- Phase 3 canvas: transactional list-item replacement with revision compare-and-swap.
-- Item mutations bump the parent element revision so the list aggregate stays versioned.

create function public.replace_list_items(
  p_board uuid,
  p_element uuid,
  p_expected_revision integer,
  p_items jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_element::text, 0));

  select revision into current_revision
  from public.elements
  where id = p_element and board_id = p_board and type = 'list'
  for update;

  if not found then
    raise exception 'element_not_found';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'revision_conflict';
  end if;

  delete from public.list_items where element_id = p_element;
  insert into public.list_items (element_id, text, completed, position)
  select p_element,
         btrim(item.item->>'text'),
         coalesce((item.item->>'completed')::boolean, false),
         item.ord - 1
  from jsonb_array_elements(p_items) with ordinality as item(item, ord);

  update public.elements
  set revision = revision + 1, updated_at = now()
  where id = p_element;

  return current_revision + 1;
end;
$$;

revoke all on function public.replace_list_items(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.replace_list_items(uuid, uuid, integer, jsonb) to service_role;
