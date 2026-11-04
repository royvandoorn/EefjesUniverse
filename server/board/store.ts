import { supabaseAdmin } from '../media/supabase.ts';
import { contentSchemaFor, type BoardElement, type BoardPayload, type ListItem, type VisualGroup } from '../../src/shared/board.ts';

type ElementRow = {
  id: string;
  type: BoardElement['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  group_id: string | null;
  media_id: string | null;
  revision: number;
  content: unknown;
  created_at: string;
  updated_at: string;
};

export function toElement(row: ElementRow): BoardElement {
  const content = contentSchemaFor(row.type).parse(row.content);
  return {
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.z_index,
    groupId: row.group_id,
    mediaId: row.media_id,
    revision: row.revision,
    content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toGroup = (row: Record<string, unknown>): VisualGroup => ({
  id: row.id as string,
  name: row.name as string,
  colourKey: row.colour_key as string,
  x: row.x as number,
  y: row.y as number,
  width: row.width as number,
  height: row.height as number,
});

const toItem = (row: Record<string, unknown>): ListItem => ({
  id: row.id as string,
  text: row.text as string,
  completed: row.completed as boolean,
  position: row.position as number,
});

export async function fetchBoardPayload(id: string): Promise<BoardPayload | null> {
  const db = supabaseAdmin();
  const { data: board, error: boardError } = await db
    .from('boards').select('id, title, min_width, min_height').eq('id', id).maybeSingle();
  if (boardError) throw new Error('Board lookup failed');
  if (!board) return null;

  const [{ data: groups, error: groupsError }, { data: elements, error: elementsError }] =
    await Promise.all([
      db.from('visual_groups').select('*').eq('board_id', id).order('name'),
      db.from('elements').select('*').eq('board_id', id).order('z_index').order('created_at'),
    ]);
  if (groupsError || elementsError) throw new Error('Board load failed');

  const elementIds = (elements ?? []).map(row => row.id);
  const { data: items, error: itemsError } = elementIds.length
    ? await db.from('list_items').select('*').in('element_id', elementIds).order('position')
    : { data: [], error: null };
  if (itemsError) throw new Error('Board load failed');

  const itemsByElement: Record<string, ListItem[]> = {};
  for (const row of items ?? []) {
    (itemsByElement[row.element_id as string] ??= []).push(toItem(row));
  }

  return {
    board: {
      id: board.id,
      title: board.title,
      minWidth: board.min_width,
      minHeight: board.min_height,
    },
    groups: (groups ?? []).map(toGroup),
    elements: (elements ?? []).map(row => toElement(row as ElementRow)),
    items: itemsByElement,
  };
}
