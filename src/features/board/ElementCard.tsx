import { useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import type { BoardElement, ListItem, NoteContent, ListContent, ImageContent, TextSize } from '../../shared/board.ts';
import type { SaveState } from '../saving/saver.ts';
import type { Rect } from './placement.ts';
import { PhotoViewer } from './PhotoViewer.tsx';

const NOTE_COLOURS: Record<string, string> = {
  paper: 'bg-amber-50 border-amber-200',
  white: 'bg-white border-neutral-300',
  rose: 'bg-rose-100 border-rose-200',
  sky: 'bg-sky-100 border-sky-200',
  mint: 'bg-emerald-100 border-emerald-200',
  lilac: 'bg-violet-100 border-violet-200',
};

export const NOTE_COLOUR_KEYS = Object.keys(NOTE_COLOURS);

export const TITLE_SIZE_CLASSES: Record<TextSize, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-xl',
};

export const BODY_SIZE_CLASSES: Record<TextSize, string> = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
};

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

  const colour = element.type === 'image'
    ? 'bg-white border-neutral-300 p-0 overflow-hidden'
    : NOTE_COLOURS[(element.content as NoteContent | ListContent).colourKey] ??
      (element.type === 'note' ? NOTE_COLOURS.paper : NOTE_COLOURS.white);

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
      className={`absolute flex flex-col rounded-lg border ${live ? 'shadow-xl ring-2 ring-neutral-400 select-none' : 'shadow-sm'} ${colour}`}
      style={{ left: x, top: y, width, height, zIndex: live ? 1000 : element.zIndex }}
      aria-label={`${element.type} card`}
    >
      {editable && (
        <div
          className="flex h-12 shrink-0 cursor-grab touch-none items-center justify-between rounded-t-lg border-b border-black/10 bg-black/5 px-2 select-none active:cursor-grabbing"
          role="button"
          tabIndex={0}
          aria-label={`Move ${element.type} card. Arrow keys move it.`}
          onPointerDown={event => props.onHandlePointerDown(event, element.id)}
          onKeyDown={moveKeys}
        >
          <span aria-hidden className="px-2 text-lg tracking-widest text-neutral-500">⠿⠿</span>
          <span className="flex gap-1">
            <button
              type="button"
              className="min-h-11 min-w-11 rounded text-sm text-neutral-700 hover:bg-black/10"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => props.onEdit(element.id)}
            >
              Edit
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded text-sm text-red-700 hover:bg-black/10"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => props.onDelete(element.id)}
              aria-label="Delete card"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between px-2 text-[11px] text-neutral-500">
        {editable ? (
          status === 'failed' ? (
            <button type="button" className="text-red-700 underline" onClick={() => props.onRetry(element.id)}>
              {STATUS_TEXT[status]}
            </button>
          ) : (
            <span aria-live="polite">{STATUS_TEXT[status]}</span>
          )
        ) : <span />}
        {editable && (
          <span
            className="absolute right-0 bottom-0 flex h-11 w-11 cursor-nwse-resize touch-none items-end justify-end p-2 text-neutral-500"
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
    <>
      {content.title && (
        <h3 className={`mb-1 font-semibold break-words ${TITLE_SIZE_CLASSES[content.titleSize ?? 'medium']}`}>
          {content.title}
        </h3>
      )}
      <p className={`break-words whitespace-pre-wrap ${BODY_SIZE_CLASSES[content.bodySize ?? 'medium']}`}>{content.body}</p>
    </>
  );
}

function ListBody({ content, items, editable, onToggle }: {
  content: ListContent;
  items: ListItem[];
  editable: boolean;
  onToggle(position: number): void;
}) {
  const itemSize = BODY_SIZE_CLASSES[content.itemSize ?? 'medium'];
  return (
    <>
      <h3 className={`mb-1 font-semibold break-words ${TITLE_SIZE_CLASSES[content.titleSize ?? 'medium']}`}>{content.title}</h3>
      <ul className="flex flex-col gap-1">
        {items.map(item => (
          <li key={item.id} className={`flex items-center gap-2 ${itemSize}`}>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={item.completed}
              disabled={!editable}
              onChange={() => onToggle(item.position)}
              aria-label={item.text}
            />
            <span className={item.completed ? 'text-neutral-400 line-through' : ''}>{item.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ImageBody({ element, content }: { element: BoardElement; content: ImageContent }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [viewing, setViewing] = useState(false);
  const mediaId = content.mediaId;
  return (
    <figure className="flex h-full flex-col">
      {failed === mediaId ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-sm" role="status">
          <span>Photo unavailable.</span>
          <button type="button" className="min-h-11 rounded border px-3" onClick={() => { setFailed(null); setAttempt(value => value + 1); }}>Retry photo</button>
        </div>
      ) : <>
        {loaded !== mediaId && <span role="status" className="text-xs text-neutral-500">Loading photo…</span>}
        <button type="button" aria-label="View photo full screen" className="relative min-h-0 w-full flex-1 cursor-zoom-in rounded focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => setViewing(true)}>
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
          className="h-full w-full rounded object-contain"
        />
        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-2 py-1 text-xs text-white">View full screen</span>
        </button>
      </>}
      {viewing && <PhotoViewer content={content} onClose={() => setViewing(false)} />}
      {content.caption && <figcaption className="mt-1 text-sm break-words">{content.caption}</figcaption>}
    </figure>
  );
}
