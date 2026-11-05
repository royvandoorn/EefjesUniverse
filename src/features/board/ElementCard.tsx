import { useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import type { BoardElement, ListItem, NoteContent, ListContent, ImageContent, TextContent, TextSize, FontSize, TextAlignment, TextFont } from '../../shared/board.ts';
import { COLOUR_KEYS } from '../../shared/board.ts';
import type { SaveState } from '../saving/saver.ts';
import type { Rect } from './placement.ts';
import { PhotoViewer } from './PhotoViewer.tsx';

// One shared palette: `card` styles note/list backgrounds, `swatch` is the
// editor colour dot and `text` is the readable foreground for text elements.
interface ColourDef { card: string; swatch: string; text: string }
const PALETTE: Record<string, ColourDef> = {
  ink: { card: 'bg-neutral-200 border-neutral-400', swatch: 'bg-neutral-700', text: 'text-neutral-900' },
  slate: { card: 'bg-slate-100 border-slate-300', swatch: 'bg-slate-300', text: 'text-slate-700' },
  cocoa: { card: 'bg-stone-200 border-stone-300', swatch: 'bg-stone-400', text: 'text-stone-700' },
  white: { card: 'bg-white border-neutral-300', swatch: 'bg-white', text: 'text-neutral-700' },
  paper: { card: 'bg-amber-50 border-amber-200', swatch: 'bg-amber-100', text: 'text-amber-800' },
  lemon: { card: 'bg-yellow-100 border-yellow-200', swatch: 'bg-yellow-300', text: 'text-yellow-700' },
  peach: { card: 'bg-orange-100 border-orange-200', swatch: 'bg-orange-300', text: 'text-orange-700' },
  coral: { card: 'bg-red-100 border-red-200', swatch: 'bg-red-300', text: 'text-red-700' },
  rose: { card: 'bg-rose-100 border-rose-200', swatch: 'bg-rose-300', text: 'text-rose-700' },
  pink: { card: 'bg-pink-100 border-pink-200', swatch: 'bg-pink-300', text: 'text-pink-700' },
  berry: { card: 'bg-fuchsia-100 border-fuchsia-200', swatch: 'bg-fuchsia-300', text: 'text-fuchsia-700' },
  lavender: { card: 'bg-purple-100 border-purple-200', swatch: 'bg-purple-300', text: 'text-purple-700' },
  lilac: { card: 'bg-violet-100 border-violet-200', swatch: 'bg-violet-300', text: 'text-violet-700' },
  denim: { card: 'bg-blue-100 border-blue-200', swatch: 'bg-blue-300', text: 'text-blue-700' },
  sky: { card: 'bg-sky-100 border-sky-200', swatch: 'bg-sky-300', text: 'text-sky-700' },
  teal: { card: 'bg-teal-100 border-teal-200', swatch: 'bg-teal-300', text: 'text-teal-700' },
  mint: { card: 'bg-emerald-100 border-emerald-200', swatch: 'bg-emerald-300', text: 'text-emerald-700' },
  lime: { card: 'bg-lime-100 border-lime-200', swatch: 'bg-lime-300', text: 'text-lime-700' },
};

export const NOTE_COLOUR_KEYS = COLOUR_KEYS as readonly string[];
export const COLOUR_SWATCHES = Object.fromEntries(COLOUR_KEYS.map(key => [key, PALETTE[key].swatch]));

const CARD_COLOURS: Record<string, string> = Object.fromEntries(COLOUR_KEYS.map(key => [key, PALETTE[key].card]));
const TEXT_COLOURS: Record<string, string> = {
  ...Object.fromEntries(COLOUR_KEYS.map(key => [key, PALETTE[key].text])),
  ocean: 'text-sky-700', forest: 'text-emerald-700', grape: 'text-violet-700',
};

// Legacy named sizes map to pixels per context so old cards keep their look.
const LEGACY_PX: Record<'title' | 'body' | 'heading', Record<TextSize, number>> = {
  title: { small: 14, medium: 16, large: 20, xlarge: 24 },
  body: { small: 12, medium: 14, large: 16, xlarge: 18 },
  heading: { small: 24, medium: 36, large: 60, xlarge: 96 },
};

export function fontSizePx(size: FontSize | undefined, kind: 'title' | 'body' | 'heading', fallback: number): number {
  if (typeof size === 'number') return size;
  return LEGACY_PX[kind][size ?? 'medium'] ?? fallback;
}

export const TEXT_ALIGN_CLASSES: Record<TextAlignment, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

// System font stacks — external webfonts would be blocked by the CSP.
export const TEXT_FONTS: Record<TextFont, string> = {
  hand: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive',
  script: '"Lucida Handwriting", "Segoe Script", "Brush Script MT", cursive',
  serif: 'Georgia, "Times New Roman", serif',
  elegant: '"Palatino Linotype", "Book Antiqua", Palatino, Garamond, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  round: '"Segoe UI Rounded", "Trebuchet MS", Verdana, sans-serif',
  mono: 'ui-monospace, Consolas, "Courier New", monospace',
  black: 'Impact, "Arial Black", sans-serif',
  marker: '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive',
  papyrus: 'Papyrus, Herculanum, fantasy',
};

// Rainbow letters — same per-letter colours as the login title.
const RAINBOW_COLOURS = [
  'text-rose-500', 'text-orange-500', 'text-amber-500', 'text-emerald-600',
  'text-sky-500', 'text-violet-500', 'text-fuchsia-500',
];

const STATUS_TEXT: Record<SaveState, string> = {
  saved: 'Saved',
  dirty: 'Saving…',
  saving: 'Saving…',
  failed: 'Not saved — retry',
  conflict: 'Changed elsewhere',
};

interface Props {
  element: BoardElement;
  items: ListItem[];
  live: Partial<Rect> | undefined;
  editable: boolean;
  deleting?: boolean;
  status: SaveState;
  registerRef(id: string, node: HTMLElement | null): void;
  onHandlePointerDown(event: ReactPointerEvent, id: string): void;
  onResizePointerDown(event: ReactPointerEvent, id: string): void;
  onKeyboardMove(id: string, dx: number, dy: number): void;
  onKeyboardResize(id: string, dw: number, dh: number): void;
  onEdit(id: string): void;
  onDelete(id: string): void;
  onToggleItem(id: string, position: number): void;
  onRetry(id: string): void;
}

export function ElementCard(props: Props) {
  const { element, live, editable, status } = props;
  const x = live?.x ?? element.x;
  const y = live?.y ?? element.y;
  const width = live?.width ?? element.width;
  const height = live?.height ?? element.height;

  const isText = element.type === 'text';
  const isImage = element.type === 'image';
  const colour = isText
    ? 'bg-transparent border-transparent'
    : isImage
      ? 'bg-white border-neutral-300 p-0 overflow-hidden'
      : CARD_COLOURS[(element.content as NoteContent | ListContent).colourKey] ??
        (element.type === 'note' ? CARD_COLOURS.paper : CARD_COLOURS.white);

  const moveKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[event.key];
    if (d) {
      event.preventDefault();
      props.onKeyboardMove(element.id, d[0], d[1]);
    }
  };

  const resizeKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[event.key];
    if (d) {
      event.preventDefault();
      props.onKeyboardResize(element.id, d[0], d[1]);
    }
  };

  if (props.deleting) return (
    <article className="absolute flex items-center justify-center rounded-lg border border-neutral-300 bg-white/80 text-sm text-neutral-600"
      style={{ left: x, top: y, width, height, zIndex: element.zIndex }} aria-busy="true" aria-label={`${element.type} card`}>
      <span role="status">Deleting…</span>
    </article>
  );

  return (
    <article
      ref={node => props.registerRef(element.id, node)}
      className={`absolute flex flex-col rounded-lg border ${live ? 'shadow-xl ring-2 ring-neutral-400 select-none' : isText ? '' : 'shadow-sm'} ${colour} ${isText && editable && !live ? 'border-dashed border-neutral-300' : ''}`}
      style={{ left: x, top: y, width, height, zIndex: live ? 1000 : element.zIndex }}
      aria-label={`${element.type} card`}
      onDoubleClick={isText && editable ? () => props.onEdit(element.id) : undefined}
    >
      {editable && (
        <div
          className={`flex h-12 shrink-0 cursor-grab touch-none items-center justify-between rounded-t-lg px-2 select-none active:cursor-grabbing ${
            isImage ? 'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/50 to-transparent' : isText ? '' : 'border-b border-black/10 bg-black/5'
          }`}
          role="button"
          tabIndex={0}
          aria-label={`Move ${element.type} card. Arrow keys move it.`}
          onPointerDown={event => props.onHandlePointerDown(event, element.id)}
          onKeyDown={moveKeys}
        >
          <span aria-hidden className={`px-2 text-lg tracking-widest ${isImage ? 'text-white drop-shadow' : 'text-neutral-500'}`}>⠿⠿</span>
          <span className="flex gap-1">
            {!isText && (
              <button
                type="button"
                className={`min-h-11 min-w-11 rounded text-sm hover:bg-black/10 ${isImage ? 'bg-black/30 text-white' : 'text-neutral-700'}`}
                onPointerDown={event => event.stopPropagation()}
                onClick={() => props.onEdit(element.id)}
              >
                Edit
              </button>
            )}
            <button
              type="button"
              className={`min-h-11 min-w-11 rounded text-sm hover:bg-black/10 ${isImage ? 'bg-black/30 text-red-100' : 'text-red-700'}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => props.onDelete(element.id)}
              aria-label="Delete card"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      <div className={isImage ? 'relative min-h-0 flex-1' : 'min-h-0 flex-1 overflow-y-auto p-3'}>
        {element.type === 'note' && <NoteBody content={element.content as NoteContent} />}
        {element.type === 'list' && (
          <ListBody
            content={element.content as ListContent}
            items={props.items}
            editable={editable}
            onToggle={position => props.onToggleItem(element.id, position)}
          />
        )}
        {element.type === 'image' && <ImageBody element={element} content={element.content as ImageContent} />}
        {element.type === 'text' && <TextBody content={element.content as TextContent} />}
      </div>

      <div className={`flex h-6 shrink-0 items-center justify-between px-2 text-[11px] ${isImage ? 'absolute inset-x-0 bottom-0 z-10 text-white/85' : 'text-neutral-500'}`}>
        {editable && !isText ? (
          status === 'failed' ? (
            <button type="button" className={`${isImage ? 'rounded bg-black/50 px-1' : ''} text-red-700 underline ${isImage ? 'text-red-200' : ''}`} onClick={() => props.onRetry(element.id)}>
              {STATUS_TEXT[status]}
            </button>
          ) : (
            <span aria-live="polite" className={isImage ? 'rounded bg-black/50 px-1' : ''}>{STATUS_TEXT[status]}</span>
          )
        ) : <span />}
        {editable && (
          <span
            className={`absolute right-0 bottom-0 flex h-11 w-11 cursor-nwse-resize touch-none items-end justify-end p-2 ${isImage ? 'text-white drop-shadow' : 'text-neutral-500'}`}
            role="button"
            tabIndex={0}
            aria-label="Resize card. Arrow keys resize it."
            onPointerDown={event => props.onResizePointerDown(event, element.id)}
            onKeyDown={resizeKeys}
          >
            <span aria-hidden>◢</span>
          </span>
        )}
      </div>
    </article>
  );
}

function NoteBody({ content }: { content: NoteContent }) {
  return (
    <div style={{ fontFamily: TEXT_FONTS[content.font ?? 'sans'] }}>
      {content.title && (
        <h3 className="mb-1 font-semibold break-words" style={{ fontSize: fontSizePx(content.titleSize, 'title', 16) }}>
          {content.title}
        </h3>
      )}
      <p className="break-words whitespace-pre-wrap" style={{ fontSize: fontSizePx(content.bodySize, 'body', 14) }}>{content.body}</p>
    </div>
  );
}

function ListBody({ content, items, editable, onToggle }: {
  content: ListContent;
  items: ListItem[];
  editable: boolean;
  onToggle(position: number): void;
}) {
  const itemSize = fontSizePx(content.itemSize, 'body', 14);
  return (
    <div style={{ fontFamily: TEXT_FONTS[content.font ?? 'sans'] }}>
      <h3 className="mb-1 font-semibold break-words" style={{ fontSize: fontSizePx(content.titleSize, 'title', 16) }}>{content.title}</h3>
      <ul className="flex flex-col gap-1">
        {items.map(item => (
          <li key={item.id} className="flex items-center gap-2" style={{ fontSize: itemSize }}>
            <input
              type="checkbox"
              className="shrink-0"
              style={{ width: Math.max(18, Math.round(itemSize * 1.2)), height: Math.max(18, Math.round(itemSize * 1.2)) }}
              checked={item.completed}
              disabled={!editable}
              onChange={() => onToggle(item.position)}
              aria-label={item.text}
            />
            <span className={item.completed ? 'text-neutral-400 line-through' : ''}>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextBody({ content }: { content: TextContent }) {
  const style = { fontSize: fontSizePx(content.fontSize, 'heading', 60), fontFamily: TEXT_FONTS[content.font ?? 'serif'] };
  if (content.colourKey === 'rainbow') {
    return (
      <p className={`font-semibold break-words whitespace-pre-wrap ${TEXT_ALIGN_CLASSES[content.alignment ?? 'left']}`} style={style}>
        {[...content.body].map((letter, index) => (
          <span key={index} className={RAINBOW_COLOURS[index % RAINBOW_COLOURS.length]}>{letter}</span>
        ))}
      </p>
    );
  }
  return (
    <p
      className={`font-semibold break-words whitespace-pre-wrap ${TEXT_COLOURS[content.colourKey ?? 'ink'] ?? 'text-neutral-900'} ${TEXT_ALIGN_CLASSES[content.alignment ?? 'left']}`}
      style={style}
    >
      {content.body}
    </p>
  );
}

function ImageBody({ element, content }: { element: BoardElement; content: ImageContent }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [viewing, setViewing] = useState(false);
  const mediaId = content.mediaId;
  return (
    <figure className="absolute inset-0">
      {failed === mediaId ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-white text-sm" role="status">
          <span>Photo unavailable.</span>
          <button type="button" className="min-h-11 rounded border px-3" onClick={() => { setFailed(null); setAttempt(value => value + 1); }}>Retry photo</button>
        </div>
      ) : <>
        {loaded !== mediaId && <span role="status" className="absolute inset-x-0 top-1 z-[5] text-center text-xs text-neutral-500">Loading photo…</span>}
        <button type="button" aria-label="View photo full screen" className="block h-full w-full cursor-zoom-in rounded focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setViewing(true)}>
        <img
          key={`${mediaId}-${attempt}`}
          src={`/api/media/${mediaId}/display`}
          alt={content.caption ?? 'Photo'}
          width={element.width}
          height={element.height}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(mediaId)}
          onError={() => setFailed(mediaId)}
          className="h-full w-full rounded object-cover"
        />
        </button>
        {content.caption && (
          <figcaption
            className="pointer-events-none absolute inset-x-0 bottom-0 break-words bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-center text-white"
            style={{ fontSize: fontSizePx(content.captionSize, 'body', 14), fontFamily: TEXT_FONTS[content.captionFont ?? 'sans'] }}
          >{content.caption}</figcaption>
        )}
      </>}
      {viewing && <PhotoViewer content={content} onClose={() => setViewing(false)} />}
    </figure>
  );
}
