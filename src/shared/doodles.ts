// Scrapbook doodles. Drop drawings/photos into src/assets/doodles/ (png, jpg,
// webp, gif or svg) and they are bundled and mixed in at random — on the
// login screen and scattered over the board. Emoji doodles fill in around
// them so the board stays fun even with no images added.

const modules = import.meta.glob('../assets/doodles/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const DOODLE_IMAGES = Object.values(modules as Record<string, string>);

export const DOODLE_EMOJIS = [
  '👩‍🏫', '🏐', '🏃‍♀️', '🏄‍♀️', '💃', '🎉', '⭐', '🌸',
  '🎨', '📚', '💖', '🌈', '✏️', '🧸', '🎀', '🍀',
];

/** Deterministic RNG so one layout stays stable within a session. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Doodle {
  image?: string;
  emoji?: string;
  x: number;
  y: number;
  size: number;
  rotate: number;
}

const pick = <T,>(pool: T[], rand: () => number) => pool[Math.floor(rand() * pool.length)];

// Fixed cell grid: every cell's doodle is seeded by the cell coordinates, so
// doodles never move when the board world grows — new cells simply add more.
const DOODLE_CELL = 680;

/** Sparse random doodles in fixed cells across the board world. */
export function boardDoodles(width: number, height: number, seed: number): Doodle[] {
  const doodles: Doodle[] = [];
  for (let cy = 0; cy * DOODLE_CELL < height; cy += 1) {
    for (let cx = 0; cx * DOODLE_CELL < width; cx += 1) {
      const rand = mulberry32(seed + cx * 73856093 + cy * 19349663);
      if (rand() < 0.25) continue; // some cells stay empty for an organic feel
      const image = DOODLE_IMAGES.length && rand() < 0.5 ? pick(DOODLE_IMAGES, rand) : undefined;
      const size = image ? 70 + Math.round(rand() * 70) : 36 + Math.round(rand() * 44);
      doodles.push({
        image,
        emoji: image ? undefined : pick(DOODLE_EMOJIS, rand),
        x: Math.min(cx * DOODLE_CELL + Math.round(rand() * (DOODLE_CELL - size)), Math.max(0, width - size)),
        y: Math.min(cy * DOODLE_CELL + Math.round(rand() * (DOODLE_CELL - size)), Math.max(0, height - size)),
        size,
        rotate: Math.round((rand() - 0.5) * 40),
      });
    }
  }
  return doodles;
}

/** Random pick of images/emoji for a fixed set of decorative slots. */
export function slotDoodles<T>(slots: T[], rand: () => number): (T & { image?: string; emoji: string })[] {
  return slots.map(slot => {
    const image = DOODLE_IMAGES.length && rand() < 0.6 ? pick(DOODLE_IMAGES, rand) : undefined;
    return { ...slot, image, emoji: image ? '' : pick(DOODLE_EMOJIS, rand) };
  });
}
