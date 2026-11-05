import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type FormEvent } from 'react';
import {
  BOARD_MAX_AXIS,
  imageCardSize,
  CARD_DEFAULT_HEIGHT,
  CARD_DEFAULT_WIDTH,
  CARD_MAX_HEIGHT,
  CARD_MAX_WIDTH,
  CARD_MIN_HEIGHT,
  CARD_MIN_WIDTH,
  type BoardElement,
  type ListItem,
  type VisualGroup,
} from '../../shared/board.ts';
import { boardApi, type BoardApi } from './api.ts';
import { findFreeSpot, worldSize, type Rect } from './placement.ts';
import { BoardSaver, type SaveState } from '../saving/saver.ts';
import { DraftStore, type ElementDraft } from '../saving/drafts.ts';
import { ElementCard } from './ElementCard.tsx';
import { CardEditor } from './CardEditor.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';
import type { UploadedImage } from './api.ts';
import { createUuid } from '../../shared/uuid.ts';
import { boardDoodles } from '../../shared/doodles.ts';

export interface SessionInfo {
  role: 'viewer' | 'editor';
  expiresAt: string;
  csrfToken: string;
}

const MOVE_THRESHOLD = 8;
const EDGE_ZONE = 56;
const EDGE_SPEED = 18;



const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Keep React keys stable across optimistic edits and server acknowledgements:
 * match incoming items to previous ones by content (position changes on
 * reorder, so identity follows text+completed) and reuse their ids.
 */
function mergeItems(prev: ListItem[] | undefined, next: ListItem[]): ListItem[] {
  const pool = new Map<string, string[]>();
  for (const item of prev ?? []) {
    const key = `${item.text}${item.completed}`;
    const ids = pool.get(key);
    if (ids) ids.push(item.id);
    else pool.set(key, [item.id]);
  }
  const matched = next.map(item => pool.get(`${item.text}${item.completed}`)?.shift());
  const used = new Set(matched.filter(Boolean));
  return next.map((item, index) => {
    const previous = prev?.[index]?.id;
    const id = matched[index] ?? (previous && !used.has(previous) ? previous : item.id);
    used.add(id);
    return { ...item, id };
  });
}

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  orig: Rect;
  cur: Rect;
  ratio: number;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
}

export function BoardView({ session, onLogout, onSession }: {
  session: SessionInfo;
  onLogout(): void;
  onSession(session: SessionInfo): void;
}) {
  const editable = session.role === 'editor';
  const api: BoardApi = useMemo(() => boardApi(session.csrfToken), [session.csrfToken]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState("Eefje's universum");
  const [minSize, setMinSize] = useState({ width: 2400, height: 1600 });
  const [groups, setGroups] = useState<VisualGroup[]>([]);
  const [elements, setElements] = useState<Record<string, BoardElement>>({});
  const [items, setItems] = useState<Record<string, ListItem[]>>({});
  const [statuses, setStatuses] = useState<Record<string, SaveState>>({});
  const [live, setLive] = useState<Record<string, Partial<Rect>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const deletingRef = useRef(new Set<string>());
  const [newPhoto, setNewPhoto] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoId = useRef(createUuid());
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reloginPassword, setReloginPassword] = useState('');
  const [reloginBusy, setReloginBusy] = useState(false);
  const [orphanDrafts, setOrphanDrafts] = useState<ElementDraft[]>([]);
  const [showDoodles, setShowDoodles] = useState(() => {
    try { return localStorage.getItem('eefje-doodles') !== 'off'; } catch { return true; }
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<DragState | null>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const rafRef = useRef(0);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;

  const saverRef = useRef<BoardSaver | null>(null);
  const draftsRef = useRef<DraftStore | null>(null);

  const applyElement = useCallback((element: BoardElement) => {
    setElements(prev => ({ ...prev, [element.id]: element }));
  }, []);

  const reload = useCallback(async () => {
    const payload = await api.loadBoard();
    setTitle(payload.board.title);
    setMinSize({ width: payload.board.minWidth, height: payload.board.minHeight });
    setGroups(payload.groups);
    setElements(Object.fromEntries(payload.elements.map(element => [element.id, element])));
    setItems(payload.items);
    setStatuses(Object.fromEntries(payload.elements.map(element => [element.id, 'saved' as SaveState])));
    for (const element of payload.elements) saverRef.current?.setRevision(element.id, element.revision);
    return payload;
  }, [api]);

  // Rebuild the saver whenever the CSRF token rotates (fresh login). Unsent
  // work from the previous saver is carried over so re-login never drops it.
  useEffect(() => {
    const carried = saverRef.current?.pendingSnapshot();
    const saver = new BoardSaver(api, {
      onElement: applyElement,
      onItems: (id, list) => setItems(prev => ({ ...prev, [id]: mergeItems(prev[id], list) })),
      onStatus: (id, state) => setStatuses(prev => ({ ...prev, [id]: state })),
      onConflict: (_id, serverElement) => {
        if (serverElement) applyElement(serverElement);
        else void reload().catch(() => undefined);
        setNotice('A card was changed elsewhere — the latest version is on screen now.');
      },
      onSessionExpired: () => setSessionExpired(true),
      onForbidden: () => setNotice('Saving was refused by a permission or security check. Reload the page if this keeps happening.'),
      onDraftChanged: (id, draft) => {
        const store = draftsRef.current;
        if (!store) return;
        if (draft) void store.put({ id, patch: draft.patch, items: draft.items, updatedAt: Date.now() });
        else void store.remove(id);
      },
    });
    saverRef.current = saver;
    for (const element of Object.values(elementsRef.current)) {
      saver.setRevision(element.id, element.revision);
    }
    if (carried) {
      for (const [id, work] of carried) {
        if (Object.keys(work.patch).length > 0) saver.patch(id, work.patch);
        if (work.items) saver.setItems(id, work.items);
        saver.flush(id);
      }
    }
  }, [api, applyElement, reload]);

  useEffect(() => {
    reload().then(async payload => {
      // Restore unconfirmed IndexedDB drafts (editor only): re-queue them so
      // they retry saving, and list leftovers — e.g. their card was deleted
      // elsewhere — for an explicit retry/discard choice.
      if (editable) {
        const store = new DraftStore();
        if (await store.open()) {
          draftsRef.current = store;
          const drafts = await store.all();
          if (drafts.length) {
            const onBoard = new Set(payload.elements.map(element => element.id));
            let restored = 0;
            const orphans: ElementDraft[] = [];
            for (const draft of drafts) {
              if (!onBoard.has(draft.id)) {
                orphans.push(draft);
                continue;
              }
              restored += 1;
              if (Object.keys(draft.patch).length > 0) saverRef.current?.patch(draft.id, draft.patch);
              if (draft.items) saverRef.current?.setItems(draft.id, draft.items);
              saverRef.current?.flush(draft.id);
            }
            setOrphanDrafts(orphans);
            if (restored) setNotice(`${restored} unsaved ${restored === 1 ? 'change' : 'changes'} from last time restored — saving again.`);
          }
        }
      }
      setLoading(false);
    }).catch(() => {
      setLoadError('Could not load the board. Please try again.');
      setLoading(false);
    });
  }, [reload, editable]);

  // Revalidate on tab return without touching cards that have pending,
  // failed or conflicted local edits — those keep their draft and surface
  // through the normal save/conflict flow instead of silent last-write-wins.
  const refresh = useCallback(async () => {
    const payload = await api.loadBoard();
    const saver = saverRef.current;
    const untouched = (id: string) =>
      !saver?.hasPending(id) && statusesRef.current[id] !== 'failed' && statusesRef.current[id] !== 'conflict';
    const serverIds = new Set(payload.elements.map(element => element.id));
    setElements(prev => {
      const next = { ...prev };
      for (const element of payload.elements) {
        if (untouched(element.id)) {
          next[element.id] = element;
          saver?.setRevision(element.id, element.revision);
        }
      }
      for (const id of Object.keys(next)) {
        if (!serverIds.has(id) && untouched(id)) delete next[id];
      }
      return next;
    });
    setItems(prev => {
      const next = { ...prev };
      for (const [id, list] of Object.entries(payload.items)) {
        if (untouched(id)) next[id] = mergeItems(prev[id], list);
      }
      return next;
    });
    setGroups(payload.groups);
    return payload;
  }, [api]);

  // Warn before navigation while anything is unsent; flush on page hide,
  // revalidate on return.
  useEffect(() => {
    const dirty = () => Object.values(statuses).some(s => s === 'dirty' || s === 'saving' || s === 'failed');
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty()) event.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saverRef.current?.flushAll();
      else void refresh().catch(() => undefined);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [statuses, refresh]);

  // The in-flight drag position counts toward the world size, so the board
  // grows under a card being pushed past the edge instead of leaving it
  // hanging in empty space.
  const world = useMemo(
    () => worldSize(
      minSize,
      [...Object.values(elements).map(element => ({ ...element, ...(live[element.id] ?? {}) })), ...groups],
      BOARD_MAX_AXIS,
    ),
    [minSize, elements, groups, live],
  );

  // Decorative doodles: random mix of emoji and user images in fixed cells.
  // Seeded per session and per cell, so doodles never move when the world
  // grows — cells outside the current world are simply not rendered.
  const doodleSeed = useRef(Math.floor(Math.random() * 2 ** 31));
  const doodles = useMemo(
    () => boardDoodles(world.width, world.height, doodleSeed.current),
    [world.width, world.height],
  );

  // Board zoom: toolbar buttons and Ctrl+wheel / trackpad pinch on the
  // canvas. Kept in screen space — saved world coordinates are untouched.
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const pinchPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const gestureZoom = useRef(1);

  const applyZoom = useCallback((next: number, anchor?: { clientX: number; clientY: number }) => {
    const container = containerRef.current;
    const z = clamp(next, 0.25, 2);
    if (container && anchor) {
      const box = container.getBoundingClientRect();
      const px = anchor.clientX - box.left;
      const py = anchor.clientY - box.top;
      const worldX = (container.scrollLeft + px) / zoomRef.current;
      const worldY = (container.scrollTop + py) / zoomRef.current;
      pendingScroll.current = { left: worldX * z - px, top: worldY * z - py };
    }
    setZoom(z);
  }, []);

  useEffect(() => {
    if (pendingScroll.current && containerRef.current) {
      containerRef.current.scrollLeft = pendingScroll.current.left;
      containerRef.current.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      applyZoom(zoomRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1), { clientX: event.clientX, clientY: event.clientY });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [applyZoom, loading]);

  // iOS Safari reports pinch through gesture events rather than pointer events.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureZoom.current = zoomRef.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const scale = (event as unknown as { scale?: number }).scale ?? 1;
      applyZoom(gestureZoom.current * scale, { clientX: (event as unknown as { clientX: number }).clientX, clientY: (event as unknown as { clientY: number }).clientY });
    };
    container.addEventListener('gesturestart', onGestureStart);
    container.addEventListener('gesturechange', onGestureChange);
    return () => {
      container.removeEventListener('gesturestart', onGestureStart);
      container.removeEventListener('gesturechange', onGestureChange);
    };
  }, [applyZoom, loading]);

  // --- Drag & resize -------------------------------------------------------

  const scheduleLive = useCallback((id: string, rect: Rect) => {
    setLive(prev => ({ ...prev, [id]: rect }));
  }, []);

  const edgeScroll = useCallback(() => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const box = container.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (drag.lastClientX < box.left + EDGE_ZONE) dx = -EDGE_SPEED;
    else if (drag.lastClientX > box.right - EDGE_ZONE) dx = EDGE_SPEED;
    if (drag.lastClientY < box.top + EDGE_ZONE) dy = -EDGE_SPEED;
    else if (drag.lastClientY > box.bottom - EDGE_ZONE) dy = EDGE_SPEED;
    if (dx || dy) {
      container.scrollBy(dx, dy);
      // The world moved under a stationary pointer: keep the card with it.
      if (drag.mode === 'move') {
        const worldDelta = 1 / zoomRef.current;
        drag.cur = { ...drag.cur, x: clamp(drag.cur.x + dx * worldDelta, 0, BOARD_MAX_AXIS - drag.cur.width), y: clamp(drag.cur.y + dy * worldDelta, 0, BOARD_MAX_AXIS - drag.cur.height) };
      }
      scheduleLive(drag.id, drag.cur);
    }
    rafRef.current = requestAnimationFrame(edgeScroll);
  }, [scheduleLive]);

  const endDrag = useCallback((commit: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    cancelAnimationFrame(rafRef.current);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
    if (!drag) return;
    setLive(prev => {
      const next = { ...prev };
      delete next[drag.id];
      return next;
    });
    if (!commit || !drag.moved) return;
    const element = elementsRef.current[drag.id];
    if (!element) return;
    const rect = drag.cur;
    setElements(prev => ({ ...prev, [drag.id]: { ...element, ...rect } }));
    const fields = drag.mode === 'move' ? { x: rect.x, y: rect.y } : { width: rect.width, height: rect.height };
    saverRef.current?.patch(drag.id, fields, true);
  }, [scheduleLive]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    const rawDx = event.clientX - drag.startClientX;
    const rawDy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(rawDx, rawDy) < MOVE_THRESHOLD) return;
    const dx = rawDx / zoomRef.current;
    const dy = rawDy / zoomRef.current;
    drag.moved = true;
    if (drag.mode === 'move') {
      drag.cur = {
        ...drag.cur,
        x: clamp(Math.round(drag.orig.x + dx), 0, BOARD_MAX_AXIS - drag.orig.width),
        y: clamp(Math.round(drag.orig.y + dy), 0, BOARD_MAX_AXIS - drag.orig.height),
      };
    } else {
      const size = drag.ratio
        ? imageCardSize(drag.orig, drag.orig.width + dx)
        : {
          width: clamp(Math.round(drag.orig.width + dx), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
          height: clamp(Math.round(drag.orig.height + dy), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
        };
      drag.cur = { ...drag.cur, ...size };
    }
    scheduleLive(drag.id, drag.cur);
  }, [scheduleLive]);

  const onPointerUp = useCallback((event: PointerEvent) => {
    if (dragRef.current?.pointerId === event.pointerId) endDrag(true);
  }, [endDrag]);

  const onPointerCancel = useCallback(() => endDrag(false), [endDrag]);

  const onKeyDown = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') endDrag(false);
  }, [endDrag]);

  const beginDrag = useCallback((event: ReactPointerEvent, id: string, mode: DragState['mode']) => {
    if (event.button !== 0) return;
    const element = elementsRef.current[id];
    if (!element) return;
    event.preventDefault();
    const orig: Rect = { x: element.x, y: element.y, width: element.width, height: element.height };
    dragRef.current = {
      id,
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      orig,
      cur: { ...orig },
      ratio: element.type === 'image' ? element.width / element.height : 0,
      moved: false,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    rafRef.current = requestAnimationFrame(edgeScroll);
  }, [edgeScroll, onKeyDown, onPointerCancel, onPointerMove, onPointerUp]);

  // Two-pointer pinch on the canvas (Android/Chrome and desktops with
  // touchscreens). Requires touch-action: pan-x pan-y on the container so
  // the browser pans but hands us the pinch instead of zooming the page.
  const onBoardPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') return;
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchPointers.current.size === 2) {
      endDrag(false); // a second finger turns a card drag into a pinch
      const [a, b] = [...pinchPointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
    }
  }, [endDrag]);

  const onBoardPointerMove = useCallback((event: ReactPointerEvent) => {
    if (!pinchPointers.current.has(event.pointerId)) return;
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchStart.current;
    if (!pinch || pinchPointers.current.size !== 2 || pinch.dist === 0) return;
    const [a, b] = [...pinchPointers.current.values()];
    applyZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), {
      clientX: (a.x + b.x) / 2,
      clientY: (a.y + b.y) / 2,
    });
  }, [applyZoom]);

  const onBoardPointerEnd = useCallback((event: ReactPointerEvent) => {
    pinchPointers.current.delete(event.pointerId);
    if (pinchPointers.current.size < 2) pinchStart.current = null;
  }, []);

  // --- Board actions -------------------------------------------------------

  const addElement = useCallback(async (type: 'note' | 'list' | 'text') => {
    const container = containerRef.current;
    if (!container || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    const center = {
      x: (container.scrollLeft + container.clientWidth / 2) / zoomRef.current,
      y: (container.scrollTop + container.clientHeight / 2) / zoomRef.current,
    };
    const size = type === 'text'
      ? { width: CARD_DEFAULT_WIDTH, height: CARD_MIN_HEIGHT }
      : { width: CARD_DEFAULT_WIDTH, height: CARD_DEFAULT_HEIGHT };
    const occupied = Object.values(elementsRef.current);
    const pos = findFreeSpot(occupied, size, center, world);
    const content = type === 'note'
      ? { body: '', colourKey: 'paper', titleSize: 16, bodySize: 14 }
      : type === 'list'
        ? { title: 'New list', colourKey: 'white', titleSize: 16, itemSize: 14 }
        : { body: '', fontSize: 60, colourKey: 'ink', alignment: 'left', font: 'hand' };
    try {
      const { element } = await api.createElement({ id: createUuid(), type, ...pos, ...size, content });
      applyElement(element);
      saverRef.current?.setRevision(element.id, element.revision);
      setStatuses(prev => ({ ...prev, [element.id]: 'saved' }));
      if (type === 'list') setItems(prev => ({ ...prev, [element.id]: [] }));
      requestAnimationFrame(() => cardRefs.current.get(element.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      setEditing(element.id);
    } catch {
      setNotice('Could not create the card. Please try again.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [api, applyElement, world]);

  const addPhoto = async (image: UploadedImage) => {
    const container = containerRef.current;
    if (!container) throw new Error('Board unavailable. Please try again.');
    const center = {
      x: (container.scrollLeft + container.clientWidth / 2) / zoomRef.current,
      y: (container.scrollTop + container.clientHeight / 2) / zoomRef.current,
    };
    const size = { width: CARD_DEFAULT_WIDTH, height: clamp(Math.round(CARD_DEFAULT_WIDTH * image.height / image.width) + 80, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT) };
    const pos = findFreeSpot(Object.values(elementsRef.current), size, center, world);
    const { element } = await api.createElement({ id: photoId.current, type: 'image', ...pos, ...size, content: { mediaId: image.mediaId } });
    applyElement(element);
    saverRef.current?.setRevision(element.id, element.revision);
    setStatuses(prev => ({ ...prev, [element.id]: 'saved' }));
    setNewPhoto(false);
    setEditing(element.id);
    requestAnimationFrame(() => cardRefs.current.get(element.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };

  const deleteElement = useCallback(async (id: string) => {
    const element = elementsRef.current[id];
    if (!element || deletingRef.current.has(id) || !window.confirm('Delete this card? This cannot be undone.')) return;
    deletingRef.current.add(id);
    setDeleting(new Set(deletingRef.current));
    try {
      await api.deleteElement(id, saverRef.current?.revision(id) ?? element.revision);
      saverRef.current?.discard(id);
      setElements(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setStatuses(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (editing === id) setEditing(null);
    } catch {
      setNotice('Could not delete the card. Please try again.');
    } finally {
      deletingRef.current.delete(id);
      setDeleting(new Set(deletingRef.current));
    }
  }, [api, editing]);

  const patchContent = useCallback((id: string, content: Record<string, unknown>) => {
    setElements(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], content: content as BoardElement['content'] } } : prev));
    saverRef.current?.patch(id, { content });
  }, []);

  const keyboardMove = useCallback((id: string, dx: number, dy: number) => {
    const element = elementsRef.current[id];
    if (!element) return;
    const x = clamp(element.x + dx, 0, BOARD_MAX_AXIS - element.width);
    const y = clamp(element.y + dy, 0, BOARD_MAX_AXIS - element.height);
    setElements(prev => ({ ...prev, [id]: { ...element, x, y } }));
    saverRef.current?.patch(id, { x, y }, true);
  }, []);

  const keyboardResize = useCallback((id: string, dw: number, dh: number) => {
    const element = elementsRef.current[id];
    if (!element) return;
    const { width, height } = element.type === 'image'
      ? imageCardSize(element, element.width + dw)
      : {
        width: clamp(element.width + dw, CARD_MIN_WIDTH, CARD_MAX_WIDTH),
        height: clamp(element.height + dh, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
      };
    setElements(prev => ({ ...prev, [id]: { ...element, width, height } }));
    saverRef.current?.patch(id, { width, height }, true);
  }, []);

  const toggleItem = useCallback((id: string, position: number) => {
    const list = items[id];
    if (!list) return;
    const next = list.map(item => ({ text: item.text, completed: item.position === position ? !item.completed : item.completed }));
    setItems(prev => ({
      ...prev,
      [id]: prev[id].map(item => (item.position === position ? { ...item, completed: !item.completed } : item)),
    }));
    saverRef.current?.setItems(id, next, true);
  }, [items]);

  const replaceItems = useCallback((id: string, next: { text: string; completed: boolean }[]) => {
    setItems(prev => ({
      ...prev,
      [id]: mergeItems(prev[id], next.map((item, position) => ({ id: `pending-${createUuid()}`, position, ...item }))),
    }));
    saverRef.current?.setItems(id, next);
  }, []);

  // Orphan drafts belong to cards that no longer exist on the board. Retry
  // re-fetches in case the card came back; discard drops the draft for good.
  const retryOrphanDraft = useCallback(async (draft: ElementDraft) => {
    const payload = await refresh().catch(() => null);
    if (payload?.elements.some(element => element.id === draft.id)) {
      if (Object.keys(draft.patch).length > 0) saverRef.current?.patch(draft.id, draft.patch);
      if (draft.items) saverRef.current?.setItems(draft.id, draft.items);
      saverRef.current?.flush(draft.id);
      setOrphanDrafts(prev => prev.filter(d => d.id !== draft.id));
      setNotice('Unsaved change restored — saving again.');
    } else {
      setNotice('That card is still gone from the board — the unsaved change stays until you discard it.');
    }
  }, [refresh]);

  const discardOrphanDraft = useCallback((draft: ElementDraft) => {
    void draftsRef.current?.remove(draft.id);
    setOrphanDrafts(prev => prev.filter(d => d.id !== draft.id));
  }, []);

  const relogin = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setReloginBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: reloginPassword }),
      });
      const body = await response.json();
      if (response.ok) {
        setSessionExpired(false);
        onSession(body);
        for (const id of Object.keys(statuses)) saverRef.current?.retry(id);
      } else {
        setNotice(body.error?.message ?? 'Login failed');
      }
    } catch {
      setNotice('Connection unavailable. Please try again.');
    } finally {
      setReloginPassword('');
      setReloginBusy(false);
    }
  }, [reloginPassword, onSession, statuses]);

  // --- Render ---------------------------------------------------------------

  const summary = Object.values(statuses).some(s => s === 'failed' || s === 'conflict')
    ? 'Not saved — retry'
    : Object.values(statuses).some(s => s === 'dirty' || s === 'saving')
      ? 'Saving…'
      : 'Saved';

  if (loading) return <main className="p-6 font-sans">Loading board…</main>;
  if (loadError) return <main className="p-6 font-sans"><p role="alert">{loadError}</p></main>;

  const editingElement = editing ? elements[editing] : undefined;

  return (
    <div className="flex h-dvh flex-col bg-neutral-100 font-sans">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 shadow-sm">
        <h1 className="mr-auto text-lg font-bold">{title}</h1>
        {editable && (
          <span className="text-xs text-neutral-600" role="status" aria-live="polite">{summary}</span>
        )}
        <span className="flex items-center gap-1" role="group" aria-label="Board zoom">
          <button type="button" className="min-h-11 min-w-11 rounded border border-neutral-300" aria-label="Zoom out" onClick={() => applyZoom(zoom / 1.25)}>−</button>
          <button type="button" className="min-h-11 rounded border border-neutral-300 px-2 text-xs" onClick={() => applyZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="min-h-11 min-w-11 rounded border border-neutral-300" aria-label="Zoom in" onClick={() => applyZoom(zoom * 1.25)}>+</button>
        </span>
        {editable && (
          <>
            <button type="button" className="min-h-11 rounded bg-neutral-800 px-3 text-sm text-white" disabled={creating} onClick={() => void addElement('note')}>
              + Note
            </button>
            <button type="button" className="min-h-11 rounded bg-neutral-800 px-3 text-sm text-white" disabled={creating} onClick={() => void addElement('list')}>
              + List
            </button>
            <button type="button" className="min-h-11 rounded bg-neutral-800 px-3 text-sm text-white" disabled={creating} onClick={() => void addElement('text')}>
              + Text
            </button>
            <button type="button" className="min-h-11 rounded bg-neutral-800 px-3 text-sm text-white" onClick={() => { photoId.current = createUuid(); setNewPhoto(true); }}>
              + Photo
            </button>
          </>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={showDoodles}
          aria-label="Toggle doodles"
          className="flex min-h-11 items-center gap-2 rounded border border-neutral-300 px-3 text-sm"
          onClick={() => setShowDoodles(value => {
            const next = !value;
            try { localStorage.setItem('eefje-doodles', next ? 'on' : 'off'); } catch { /* private mode */ }
            return next;
          })}
        >
          Doodles
          <span aria-hidden className={`relative inline-flex h-6 w-10 items-center rounded-full transition ${showDoodles ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${showDoodles ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </span>
        </button>
        <button type="button" className="min-h-11 rounded border border-neutral-300 px-3 text-sm" onClick={onLogout}>
          Log out
        </button>
      </header>

      {notice && (
        <p role="status" className="bg-amber-100 px-3 py-2 text-sm" onClick={() => setNotice('')}>
          {notice} <span className="underline">Dismiss</span>
        </p>
      )}
      {orphanDrafts.map(draft => (
        <p key={draft.id} role="status" className="flex flex-wrap items-center gap-2 bg-amber-100 px-3 py-2 text-sm">
          <span>An unsaved change could not be restored — its card no longer exists on the board.</span>
          <button type="button" className="min-h-11 rounded border border-neutral-400 px-3 underline" onClick={() => void retryOrphanDraft(draft)}>Retry</button>
          <button type="button" className="min-h-11 rounded border border-neutral-400 px-3 underline" onClick={() => discardOrphanDraft(draft)}>Discard</button>
        </p>
      ))}
      {sessionExpired && (
        <form onSubmit={relogin} className="flex items-center gap-2 bg-red-50 px-3 py-2 text-sm">
          <span>Session expired — unsaved changes are kept.</span>
          <input
            type="password"
            className="rounded border border-neutral-300 p-2"
            placeholder="Password"
            autoComplete="current-password"
            value={reloginPassword}
            onChange={event => setReloginPassword(event.target.value)}
            required
          />
          <button type="submit" className="min-h-11 rounded bg-neutral-800 px-3 text-white" disabled={reloginBusy}>
            {reloginBusy ? 'Logging in…' : 'Log in & resume saving'}
          </button>
        </form>
      )}

      <div
        ref={containerRef}
        className="board-surface relative flex-1 overflow-auto overscroll-contain"
        style={{ touchAction: 'pan-x pan-y' }}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerEnd}
        onPointerCancel={onBoardPointerEnd}
      >
        <div style={{ width: world.width * zoom, height: world.height * zoom }}>
          <div className="relative origin-top-left" style={{ width: world.width, height: world.height, transform: `scale(${zoom})` }}>
          {showDoodles && doodles.map((doodle, index) => (
            doodle.image ? (
              <img
                key={index}
                src={doodle.image}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute select-none"
                style={{ left: doodle.x, top: doodle.y, width: doodle.size, transform: `rotate(${doodle.rotate}deg)`, opacity: 0.45 }}
              />
            ) : (
              <span
                key={index}
                aria-hidden
                className="pointer-events-none absolute select-none"
                style={{ left: doodle.x, top: doodle.y, fontSize: doodle.size, transform: `rotate(${doodle.rotate}deg)`, opacity: 0.35 }}
              >
                {doodle.emoji}
              </span>
            )
          ))}
          {groups.map(group => (
            <div
              key={group.id}
              aria-hidden
              className="pointer-events-none absolute rounded-2xl border-2 border-dashed border-neutral-300 bg-white/40"
              style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
            >
              <span className="absolute top-2 left-3 text-sm font-medium text-neutral-500">{group.name}</span>
            </div>
          ))}
          {Object.values(elements).map(element => (
            <ElementCard
              key={element.id}
              element={element}
              deleting={deleting.has(element.id)}
              items={items[element.id] ?? []}
              live={live[element.id]}
              editable={editable}
              status={statuses[element.id] ?? 'saved'}
              registerRef={(id, node) => (node ? cardRefs.current.set(id, node) : cardRefs.current.delete(id))}
              onHandlePointerDown={(event, id) => beginDrag(event, id, 'move')}
              onResizePointerDown={(event, id) => beginDrag(event, id, 'resize')}
              onKeyboardMove={keyboardMove}
              onKeyboardResize={keyboardResize}
              onEdit={setEditing}
              onDelete={id => void deleteElement(id)}
              onToggleItem={toggleItem}
              onRetry={id => saverRef.current?.retry(id)}
            />
          ))}
          </div>
        </div>
      </div>

      {newPhoto && editable && (
        <dialog ref={node => { if (node && !node.open) node.showModal(); }}
          onCancel={event => { event.preventDefault(); if (!photoBusy) setNewPhoto(false); }}
          aria-label="Add photo" className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-xl border border-neutral-300 p-4 shadow-xl backdrop:bg-black/40">
          <h2 className="mb-4 font-semibold">Add photo</h2>
          <PhotoUpload csrfToken={session.csrfToken} onAttach={addPhoto} onBusy={setPhotoBusy} onSessionExpired={() => setSessionExpired(true)} />
          <button type="button" disabled={photoBusy} className="mt-3 min-h-11 rounded border border-neutral-300 px-4" onClick={() => setNewPhoto(false)}>Cancel</button>
        </dialog>
      )}
      {editingElement && editable && (
        <CardEditor
          key={editingElement.id}
          csrfToken={session.csrfToken}
          onResizePhoto={factor => keyboardResize(editingElement.id, editingElement.width * (factor - 1), 0)}
          onReplaceImage={async image => {
            patchContent(editingElement.id, { ...elementsRef.current[editingElement.id].content, mediaId: image.mediaId });
            saverRef.current?.flush(editingElement.id);
          }}
          onSessionExpired={() => setSessionExpired(true)}
          element={editingElement}
          items={items[editingElement.id] ?? []}
          onPatchContent={content => patchContent(editingElement.id, content)}
          onReplaceItems={next => replaceItems(editingElement.id, next)}
          onClose={() => {
            saverRef.current?.flush(editingElement.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
