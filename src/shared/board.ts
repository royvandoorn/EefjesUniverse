import { z } from 'zod';

// World geometry (CSS pixels, independent of viewport size).
export const BOARD_MIN_WIDTH = 2400;
export const BOARD_MIN_HEIGHT = 1600;
export const BOARD_MAX_AXIS = 12000;
export const BOARD_EDGE_PADDING = 160;

// Card geometry bounds enforced by the UI. The API accepts the wider
// database range so other clients are not locked out.
export const CARD_DEFAULT_WIDTH = 320;
export const CARD_DEFAULT_HEIGHT = 240;
export const CARD_MIN_WIDTH = 200;
export const CARD_MAX_WIDTH = 900;
export const CARD_MIN_HEIGHT = 120;
export const CARD_MAX_HEIGHT = 4000;
export const IMAGE_MAX_WIDTH = 2400;

export function imageCardSize(element: { x: number; y: number; width: number; height: number }, requestedWidth: number) {
  const ratio = element.width / element.height;
  const maxWidth = Math.min(IMAGE_MAX_WIDTH, CARD_MAX_HEIGHT * ratio, BOARD_MAX_AXIS - element.x, (BOARD_MAX_AXIS - element.y) * ratio);
  const minWidth = Math.min(maxWidth, Math.max(CARD_MIN_WIDTH, CARD_MIN_HEIGHT * ratio));
  const width = Math.floor(Math.min(maxWidth, Math.max(minWidth, requestedWidth)));
  return { width, height: Math.round(width / ratio) };
}

export const MAX_ELEMENTS = 500;
export const NOTE_BODY_MAX = 10_000;
export const TITLE_MAX = 120;
export const CAPTION_MAX = 1_000;
export const ITEM_TEXT_MAX = 500;
export const MAX_LIST_ITEMS = 200;

const uuid = z.string().uuid();
const axis = z.number().int().min(0).max(BOARD_MAX_AXIS);
const extent = z.number().int().min(1).max(CARD_MAX_HEIGHT);

export const textSizeSchema = z.enum(['small', 'medium', 'large']);
export type TextSize = z.infer<typeof textSizeSchema>;

export const noteContentSchema = z.object({
  title: z.string().max(TITLE_MAX).optional(),
  body: z.string().max(NOTE_BODY_MAX),
  colourKey: z.string().min(1).max(40).default('paper'),
  titleSize: textSizeSchema.default('medium'),
  bodySize: textSizeSchema.default('medium'),
}).strict();

export const listContentSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  colourKey: z.string().min(1).max(40).default('white'),
  titleSize: textSizeSchema.default('medium'),
  itemSize: textSizeSchema.default('medium'),
}).strict();

export const imageContentSchema = z.object({
  mediaId: uuid,
  caption: z.string().max(CAPTION_MAX).optional(),
}).strict();

export type ElementType = 'note' | 'image' | 'list';

export const elementTypeSchema = z.enum(['note', 'image', 'list']);

export const listItemInputSchema = z.object({
  text: z.string().trim().min(1).max(ITEM_TEXT_MAX),
  completed: z.boolean().default(false),
}).strict();

export const createElementSchema = z.object({
  id: uuid,
  type: elementTypeSchema,
  x: axis,
  y: axis,
  width: extent,
  height: extent,
  zIndex: z.number().int().min(0).max(10000).optional(),
  groupId: uuid.nullable().optional(),
  content: z.record(z.unknown()),
}).strict();

export const patchElementSchema = z.object({
  expectedRevision: z.number().int().positive(),
  x: axis.optional(),
  y: axis.optional(),
  width: extent.optional(),
  height: extent.optional(),
  zIndex: z.number().int().min(0).max(10000).optional(),
  groupId: uuid.nullable().optional(),
  content: z.record(z.unknown()).optional(),
}).strict();

export const deleteElementSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export const replaceItemsSchema = z.object({
  expectedRevision: z.number().int().positive(),
  items: z.array(listItemInputSchema).max(MAX_LIST_ITEMS),
}).strict();

// Shared shapes returned by GET /api/board.
export type NoteContent = z.infer<typeof noteContentSchema>;
export type ListContent = z.infer<typeof listContentSchema>;
export type ImageContent = z.infer<typeof imageContentSchema>;
export type ElementContent = NoteContent | ListContent | ImageContent;

export interface BoardElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  groupId: string | null;
  mediaId: string | null;
  revision: number;
  content: ElementContent;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  text: string;
  completed: boolean;
  position: number;
}

export interface VisualGroup {
  id: string;
  name: string;
  colourKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardPayload {
  board: { id: string; title: string; minWidth: number; minHeight: number };
  groups: VisualGroup[];
  elements: BoardElement[];
  items: Record<string, ListItem[]>;
}

export function contentSchemaFor(type: ElementType) {
  return type === 'note' ? noteContentSchema : type === 'list' ? listContentSchema : imageContentSchema;
}
