import { describe, expect, it } from 'vitest';
import { findFreeSpot, worldSize, type Rect } from '../src/features/board/placement.ts';
import { BOARD_EDGE_PADDING } from '../src/shared/board.ts';

const WORLD = { width: 2400, height: 1600 };
const SIZE = { width: 320, height: 240 };
const CENTER = { x: 1200, y: 800 };

describe('findFreeSpot', () => {
  it('centres the card on an empty board', () => {
    expect(findFreeSpot([], SIZE, CENTER, WORLD)).toEqual({ x: 1040, y: 680 });
  });

  it('moves aside when the preferred spot is occupied', () => {
    const blocker: Rect = { x: 900, y: 550, width: 700, height: 500 };
    const spot = findFreeSpot([blocker], SIZE, CENTER, WORLD);
    const overlaps =
      spot.x < blocker.x + blocker.width && spot.x + SIZE.width > blocker.x &&
      spot.y < blocker.y + blocker.height && spot.y + SIZE.height > blocker.y;
    expect(overlaps).toBe(false);
  });

  it('clamps to the world edges', () => {
    const spot = findFreeSpot([], SIZE, { x: 10, y: 1590 }, WORLD);
    expect(spot.x).toBe(0);
    expect(spot.y).toBe(WORLD.height - SIZE.height);
  });

  it('falls back to a visible cascade when everything nearby is taken', () => {
    const occupied: Rect[] = [];
    for (let y = 0; y < WORLD.height - SIZE.height; y += SIZE.height + 4) {
      for (let x = 0; x < WORLD.width - SIZE.width; x += SIZE.width + 4) {
        occupied.push({ x, y, ...SIZE });
      }
    }
    const spot = findFreeSpot(occupied, SIZE, CENTER, WORLD);
    expect(spot.x).toBeGreaterThanOrEqual(0);
    expect(spot.y).toBeGreaterThanOrEqual(0);
    expect(spot.x + SIZE.width).toBeLessThanOrEqual(WORLD.width);
    expect(spot.y + SIZE.height).toBeLessThanOrEqual(WORLD.height);
  });
});

describe('worldSize', () => {
  it('returns the minimum on an empty board', () => {
    expect(worldSize({ width: 2400, height: 1600 }, [], 12000)).toEqual({ width: 2400, height: 1600 });
  });

  it('grows to the furthest edge plus padding', () => {
    const rects: Rect[] = [{ x: 3000, y: 2000, width: 320, height: 240 }];
    expect(worldSize({ width: 2400, height: 1600 }, rects, 12000)).toEqual({
      width: 3000 + 320 + BOARD_EDGE_PADDING,
      height: 2000 + 240 + BOARD_EDGE_PADDING,
    });
  });

  it('caps at the maximum axis', () => {
    const rects: Rect[] = [{ x: 11800, y: 11900, width: 300, height: 300 }];
    const size = worldSize({ width: 2400, height: 1600 }, rects, 12000);
    expect(size.width).toBe(12000);
    expect(size.height).toBe(12000);
  });
});
