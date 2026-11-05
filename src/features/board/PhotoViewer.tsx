import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImageContent } from '../../shared/board.ts';

export function PhotoViewer({ content, onClose }: { content: ImageContent; onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-label="Full-screen photo" onCancel={event => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none flex-col border-0 bg-neutral-950 p-3 text-white backdrop:bg-black">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2" role="group" aria-label="Photo zoom">
          <button type="button" className="min-h-11 min-w-11 rounded border border-neutral-500 px-3 disabled:opacity-50" aria-label="Zoom photo out" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}>−</button>
          <button type="button" className="min-h-11 rounded border border-neutral-500 px-3" aria-label="Fit photo to screen" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="min-h-11 min-w-11 rounded border border-neutral-500 px-3 disabled:opacity-50" aria-label="Zoom photo in" disabled={zoom === 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}>+</button>
        </div>
        <button type="button" autoFocus className="min-h-11 rounded bg-white px-4 text-neutral-950" onClick={onClose}>Close photo</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {failed ? <div role="status" className="flex h-full flex-col items-center justify-center gap-3">
          <p>Photo unavailable.</p>
          <button type="button" className="min-h-11 rounded border px-4" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry photo</button>
        </div> : <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
          <img key={attempt} src={`/api/media/${content.mediaId}/display`} alt={content.caption || 'Photo'} draggable={false}
            className="h-full w-full object-contain" onError={() => setFailed(true)} />
        </div>}
      </div>
      {content.caption && <p className="max-h-24 shrink-0 overflow-y-auto pt-3 text-center text-sm whitespace-pre-wrap break-words">{content.caption}</p>}
    </dialog>, document.body,
  );
}
