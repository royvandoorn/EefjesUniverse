import { useEffect, useRef, useState } from 'react';
import type { BoardElement, ListItem, NoteContent, ListContent, ImageContent } from '../../shared/board.ts';
import { NOTE_BODY_MAX, TITLE_MAX, CAPTION_MAX, ITEM_TEXT_MAX, MAX_LIST_ITEMS, imageCardSize } from '../../shared/board.ts';
import { NOTE_COLOUR_KEYS } from './ElementCard.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';
import type { UploadedImage } from './api.ts';

interface Props {
  element: BoardElement;
  items: ListItem[];
  onPatchContent(content: Record<string, unknown>): void;
  onReplaceItems(items: { text: string; completed: boolean }[]): void;
  onClose(): void;
  csrfToken: string;
  onReplaceImage(image: UploadedImage): Promise<void>;
  onSessionExpired(): void;
  onResizePhoto?(factor: number): void;
}

/**
 * One editor at a time. Every change is pushed through the save queue
 * (debounced there), so "Done" closes the dialog but is not the only save.
 */
export function CardEditor({ element, items, onPatchContent, onReplaceItems, onClose, csrfToken, onReplaceImage, onSessionExpired, onResizePhoto }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const onCancel = (event: Event) => { event.preventDefault(); if (!uploadBusy) onClose(); };
    dialog?.addEventListener('cancel', onCancel);
    return () => dialog?.removeEventListener('cancel', onCancel);
  }, [onClose, uploadBusy]);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto flex max-h-[90dvh] w-[min(92vw,32rem)] flex-col rounded-xl border border-neutral-300 p-0 shadow-xl backdrop:bg-black/40"
      aria-label={`Edit ${element.type}`}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 p-3">
        <h2 className="font-semibold">Edit {element.type === 'note' ? 'note' : element.type === 'list' ? 'list' : 'photo'}</h2>
        <button type="button" className="min-h-11 min-w-11 rounded bg-neutral-800 px-4 text-white" onClick={onClose} disabled={uploadBusy}>
          {element.type === 'image' ? 'Close' : 'Done'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {element.type === 'note' && <NoteFields element={element} onPatchContent={onPatchContent} />}
        {element.type === 'list' && (
          <ListFields element={element} items={items} onPatchContent={onPatchContent} onReplaceItems={onReplaceItems} />
        )}
        {element.type === 'image' && <div className="flex flex-col gap-4">
          <ImageFields element={element} onPatchContent={onPatchContent} />
          {onResizePhoto && <fieldset className="text-sm">
            <legend className="mb-2 font-medium">Photo size on board</legend>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="min-h-11 rounded border border-neutral-300 px-4 disabled:opacity-50"
                disabled={imageCardSize(element, element.width * 0.8).width >= element.width} onClick={() => onResizePhoto(0.8)}>Smaller photo</button>
              <button type="button" className="min-h-11 rounded border border-neutral-300 px-4 disabled:opacity-50"
                disabled={imageCardSize(element, element.width * 1.25).width <= element.width} onClick={() => onResizePhoto(1.25)}>Larger photo</button>
              <span>{Math.round(element.width)} × {Math.round(element.height)} px</span>
            </div>
          </fieldset>}
          <PhotoUpload csrfToken={csrfToken} replacing onAttach={onReplaceImage} onBusy={setUploadBusy} onSessionExpired={onSessionExpired} />
        </div>}
      </div>
    </dialog>
  );
}

function NoteFields({ element, onPatchContent }: { element: BoardElement; onPatchContent: Props['onPatchContent'] }) {
  const content = element.content as NoteContent;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Title (optional)
        <input
          className="rounded border border-neutral-300 p-2"
          maxLength={TITLE_MAX}
          defaultValue={content.title ?? ''}
          onChange={event => onPatchContent({ ...content, title: event.target.value || undefined })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note
        <textarea
          className="min-h-40 rounded border border-neutral-300 p-2"
          maxLength={NOTE_BODY_MAX}
          defaultValue={content.body}
          onChange={event => onPatchContent({ ...content, body: event.target.value })}
        />
      </label>
      <ColourSwatches selected={content.colourKey} onSelect={key => onPatchContent({ ...content, colourKey: key })} />
      <SizePicker
        label="Title size"
        value={content.titleSize}
        onSelect={size => onPatchContent({ ...content, titleSize: size })}
      />
      <SizePicker
        label="Text size"
        value={content.bodySize}
        onSelect={size => onPatchContent({ ...content, bodySize: size })}
      />
    </div>
  );
}

const TEXT_SIZES = ['small', 'medium', 'large'] as const;

function SizePicker({ label, value, onSelect }: {
  label: string;
  value: string | undefined;
  onSelect(size: (typeof TEXT_SIZES)[number]): void;
}) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1">{label}</legend>
      <div className="flex gap-1" role="group" aria-label={label}>
        {TEXT_SIZES.map(size => (
          <button
            key={size}
            type="button"
            aria-pressed={(value ?? 'medium') === size}
            className={`min-h-11 rounded border px-4 capitalize ${(value ?? 'medium') === size ? 'border-neutral-800 bg-neutral-100' : 'border-neutral-300'}`}
            onClick={() => onSelect(size)}
          >
            {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const SWATCH_CLASSES: Record<string, string> = {
  paper: 'bg-amber-50',
  white: 'bg-white',
  rose: 'bg-rose-100',
  sky: 'bg-sky-100',
  mint: 'bg-emerald-100',
  lilac: 'bg-violet-100',
};

function ColourSwatches({ selected, onSelect }: { selected: string | undefined; onSelect(key: string): void }) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1">Colour</legend>
      <div className="flex gap-2">
        {NOTE_COLOUR_KEYS.map(key => (
          <button
            key={key}
            type="button"
            aria-label={`Colour ${key}`}
            aria-pressed={selected === key}
            className={`h-11 w-11 rounded-full border-2 ${SWATCH_CLASSES[key] ?? 'bg-neutral-100'} ${selected === key ? 'border-neutral-800' : 'border-neutral-300'}`}
            onClick={() => onSelect(key)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ListFields({ element, items, onPatchContent, onReplaceItems }: {
  element: BoardElement;
  items: ListItem[];
  onPatchContent: Props['onPatchContent'];
  onReplaceItems: Props['onReplaceItems'];
}) {
  const content = element.content as ListContent;
  const [newItem, setNewItem] = useState('');

  const update = (position: number, patch: Partial<ListItem>) =>
    onReplaceItems(items.map(item => (item.position === position ? { text: patch.text ?? item.text, completed: patch.completed ?? item.completed } : item)));

  const move = (position: number, direction: -1 | 1) => {
    const next = items.map(i => ({ text: i.text, completed: i.completed }));
    const target = position + direction;
    if (target < 0 || target >= next.length) return;
    [next[position], next[target]] = [next[target], next[position]];
    onReplaceItems(next);
  };

  const add = () => {
    const text = newItem.trim();
    if (!text || items.length >= MAX_LIST_ITEMS) return;
    onReplaceItems([...items.map(i => ({ text: i.text, completed: i.completed })), { text, completed: false }]);
    setNewItem('');
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        List title
        <input
          className="rounded border border-neutral-300 p-2"
          maxLength={TITLE_MAX}
          required
          defaultValue={content.title}
          onChange={event => event.target.value.trim() && onPatchContent({ ...content, title: event.target.value })}
        />
      </label>
      <ul className="flex flex-col gap-1">
        {items.map(item => (
          <li key={item.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={item.completed}
              onChange={() => update(item.position, { completed: !item.completed })}
              aria-label={`Done: ${item.text}`}
            />
            <input
              className={`min-w-0 flex-1 rounded border border-transparent p-1 text-sm hover:border-neutral-300 ${item.completed ? 'text-neutral-400 line-through' : ''}`}
              maxLength={ITEM_TEXT_MAX}
              defaultValue={item.text}
              onChange={event => event.target.value.trim() && update(item.position, { text: event.target.value })}
              aria-label="Item text"
            />
            <button type="button" className="min-h-11 min-w-11" onClick={() => move(item.position, -1)} aria-label="Move up">↑</button>
            <button type="button" className="min-h-11 min-w-11" onClick={() => move(item.position, 1)} aria-label="Move down">↓</button>
            <button
              type="button"
              className="min-h-11 min-w-11 text-red-700"
              onClick={() => onReplaceItems(items.filter(i => i.position !== item.position).map(i => ({ text: i.text, completed: i.completed })))}
              aria-label={`Remove ${item.text}`}
            >✕</button>
          </li>
        ))}
      </ul>
      {items.length < MAX_LIST_ITEMS && (
        <div className="flex gap-1">
          <input
            className="min-w-0 flex-1 rounded border border-neutral-300 p-2 text-sm"
            placeholder="New item"
            maxLength={ITEM_TEXT_MAX}
            value={newItem}
            onChange={event => setNewItem(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && (event.preventDefault(), add())}
          />
          <button type="button" className="min-h-11 rounded bg-neutral-800 px-4 text-white" onClick={add}>Add</button>
        </div>
      )}
      <ColourSwatches
        selected={content.colourKey}
        onSelect={key => onPatchContent({ ...content, colourKey: key })}
      />
      <SizePicker
        label="Title size"
        value={content.titleSize}
        onSelect={size => onPatchContent({ ...content, titleSize: size })}
      />
      <SizePicker
        label="Item size"
        value={content.itemSize}
        onSelect={size => onPatchContent({ ...content, itemSize: size })}
      />
    </div>
  );
}

function ImageFields({ element, onPatchContent }: { element: BoardElement; onPatchContent: Props['onPatchContent'] }) {
  const content = element.content as ImageContent;
  return (
    <label className="flex flex-col gap-1 text-sm">
      Caption (optional)
      <input
        className="rounded border border-neutral-300 p-2"
        maxLength={CAPTION_MAX}
        defaultValue={content.caption ?? ''}
        onChange={event => onPatchContent({ ...content, caption: event.target.value || undefined })}
      />
    </label>
  );
}
