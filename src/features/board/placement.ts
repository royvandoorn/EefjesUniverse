import { BOARD_EDGE_PADDING } from '../../shared/board.ts';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STEP = 48;
const MAX_RINGS = 12;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function clampPosition(x: number, y: number, size: { width: number; height: number }, world: { width: number; height: number }) {
  return {
    x: Math.max(0, Math.min(x, Math.max(0, world.width - size.width))),
    y: Math.max(0, Math.min(y, Math.max(0, world.height - size.height))),
  };
}

/**
 * Pick a position for a new card near the visible world-space centre.
 * Bounded ring search for a free rectangle first; when everything nearby is
 * occupied, allow overlap with a deterministic cascade offset.
 */
export function findFreeSpot(
  occupied: Rect[],
  size: { width: number; height: number },
  center: { x: number; y: number },
  world: { width: number; height: number },
): { x: number; y: number } {
  const preferred = clampPosition(
    Math.round(center.x - size.width / 2),
    Math.round(center.y - size.height / 2),
    size,
    world,
  );

  const fits = (x: number, y: number) =>
    !occupied.some(rect => overlaps({ x, y, ...size }, rect));

  if (fits(preferred.x, preferred.y)) return preferred;

  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const span = ring * STEP;
    for (let dx = -span; dx <= span; dx += STEP) {
      for (let dy = -span; dy <= span; dy += STEP) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== span) continue; // ring perimeter only
        const { x, y } = clampPosition(preferred.x + dx, preferred.y + dy, size, world);
        if (fits(x, y)) return { x, y };
      }
    }
  }

  // Crowded board: cascade over existing cards so the new card is visible.
  const offset = ((occupied.length % 8) + 1) * STEP;
  return clampPosition(preferred.x + offset, preferred.y + offset, size, world);
}

/** World size grows to the furthest element/group edge plus padding, capped per axis. */
export function worldSize(
  min: { width: number; height: number },
  rects: Rect[],
  maxAxis: number,
): { width: number; height: number } {
  let width = min.width;
  let height = min.height;
  for (const rect of rects) {
    width = Math.max(width, rect.x + rect.width + BOARD_EDGE_PADDING);
    height = Math.max(height, rect.y + rect.height + BOARD_EDGE_PADDING);
  }
  return { width: Math.min(width, maxAxis), height: Math.min(height, maxAxis) };
}
