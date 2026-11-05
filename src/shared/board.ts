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

export const textSizeSchema = z.enum(['small', 'medium', 'large', 'xlarge']);
export type TextSize = z.infer<typeof textSizeSchema>;

// Word-style point sizes for new edits; legacy named sizes stay valid so
// cards saved before the dropdown keep rendering.
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 160;
export const fontSizeSchema = z.union([textSizeSchema, z.number().int().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX)]);
export type FontSize = z.infer<typeof fontSizeSchema>;
export const FONT_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120] as const;

// One shared palette: keys drive note/list card colours and text colours.
export const COLOUR_KEYS = [
  'ink', 'slate', 'cocoa', 'white', 'paper', 'lemon', 'peach', 'coral', 'rose',
  'pink', 'berry', 'lavender', 'lilac', 'denim', 'sky', 'teal', 'mint', 'lime',
] as const;
// Text elements also accept the pre-palette legacy keys so existing cards parse.
export const textColourSchema = z.enum([...COLOUR_KEYS, 'ocean', 'forest', 'grape', 'rainbow']);
export type TextColour = z.infer<typeof textColourSchema>;

export const textAlignmentSchema = z.enum(['left', 'center', 'right']);
export type TextAlignment = z.infer<typeof textAlignmentSchema>;

export const textFontSchema = z.enum(['hand', 'script', 'serif', 'elegant', 'sans', 'round', 'mono', 'black', 'marker', 'papyrus']);
export type TextFont = z.infer<typeof textFontSchema>;

export const noteContentSchema = z.object({
  title: z.string().max(TITLE_MAX).optional(),
  body: z.string().max(NOTE_BODY_MAX),
  colourKey: z.string().min(1).max(40).default('paper'),
  titleSize: fontSizeSchema.default('medium'),
  bodySize: fontSizeSchema.default('medium'),
  font: textFontSchema.default('sans'),
}).strict();

export const listContentSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  colourKey: z.string().min(1).max(40).default('white'),
  titleSize: fontSizeSchema.default('medium'),
  itemSize: fontSizeSchema.default('medium'),
  font: textFontSchema.default('sans'),
}).strict();

export const imageContentSchema = z.object({
  mediaId: uuid,
  caption: z.string().max(CAPTION_MAX).optional(),
  captionSize: fontSizeSchema.optional(),
  captionFont: textFontSchema.optional(),
}).strict();

export const textContentSchema = z.object({
  body: z.string().max(NOTE_BODY_MAX),
  fontSize: fontSizeSchema.default('large'),
  colourKey: textColourSchema.default('ink'),
  alignment: textAlignmentSchema.default('left'),
  font: textFontSchema.default('serif'),
}).strict();

export type ElementType = 'note' | 'image' | 'list' | 'text';

export const elementTypeSchema = z.enum(['note', 'image', 'list', 'text']);

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
export type TextContent = z.infer<typeof textContentSchema>;
export type ElementContent = NoteContent | ListContent | ImageContent | TextContent;

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
  switch (type) {
    case 'note': return noteContentSchema;
    case 'list': return listContentSchema;
    case 'image': return imageContentSchema;
    case 'text': return textContentSchema;
  }
}
