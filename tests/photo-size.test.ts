import { describe, expect, it } from 'vitest';
import { BOARD_MAX_AXIS, CARD_MAX_HEIGHT, IMAGE_MAX_WIDTH, imageCardSize } from '../src/shared/board.ts';

const photo = { x: 100, y: 100, width: 320, height: 240 };

describe('imageCardSize', () => {
  it('allows photos wider than the previous 900px card limit', () => {
    expect(imageCardSize(photo, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('caps image width while preserving its proportions', () => {
    expect(imageCardSize(photo, 5000)).toEqual({ width: IMAGE_MAX_WIDTH, height: 1800 });
  });

  it('keeps tall photos inside the height limit without distorting them', () => {
    const size = imageCardSize({ ...photo, width: 320, height: 1600 }, 2400);
    expect(size).toEqual({ width: 800, height: CARD_MAX_HEIGHT });
  });

  it('respects the minimum height for wide photos', () => {
    expect(imageCardSize({ ...photo, width: 1000, height: 200 }, 100)).toEqual({ width: 600, height: 120 });
  });

  it('keeps an enlarged photo within the board boundaries', () => {
    const size = imageCardSize({ ...photo, x: BOARD_MAX_AXIS - 500, y: BOARD_MAX_AXIS - 300 }, 2000);
    expect(size).toEqual({ width: 400, height: 300 });
  });
});
