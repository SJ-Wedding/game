import { ARENA_CONFIG } from '../config/arena';
import { deriveSeed, Rng } from '../core/rng';
import canyonFloor from '../assets/arenas/canyon.webp';
import canyonSprites from '../assets/arenas/canyon-sprites.png';
import alpineFloor from '../assets/arenas/alpine.webp';
import alpineSprites from '../assets/arenas/alpine-sprites.png';

export const ARENA_ART = {
  canyon: { floor: canyonFloor, sprites: canyonSprites, tint: 0xbab4b1, edge: 0xf3c58d },
  alpine: { floor: alpineFloor, sprites: alpineSprites, tint: 0xe7edf2, edge: 0xb1d5b8 },
} as const;

type ArenaTheme = keyof typeof ARENA_ART;
const THEMES: readonly ArenaTheme[] = ['canyon', 'alpine'];
export const ARENA_ART_MARGIN = 200;
export const ARENA_SPRITE_SIZE = 32;
export const ARENA_ACTOR_FRAMES = { chaser: 0, charger: 1, spitter: 2, elite: 3, boss: 4 } as const;

interface ArenaDecoration {
  x: number;
  y: number;
  frame: number;
  scale: number;
  flipX: boolean;
}

export function arenaLayout(seed: number): { theme: ArenaTheme; decorations: ArenaDecoration[] } {
  const themeRng = new Rng(deriveSeed(seed, 'arena-theme'));
  const rng = new Rng(deriveSeed(seed, 'arena-decoration'));
  const theme = THEMES[themeRng.int(THEMES.length)];
  const { width, height } = ARENA_CONFIG;
  const decorations: ArenaDecoration[] = [];

  // 낮은 장식을 셀마다 하나씩 배치하고 시작 위치 주변을 비운다.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if (rng.next() < 0.24) continue;
      const x = Math.round((col + rng.range(0.24, 0.76)) * width / 7);
      const y = Math.round((row + rng.range(0.24, 0.76)) * height / 5);
      if (Math.hypot(x - width / 2, y - height / 2) < 190) continue;
      decorations.push({ x, y, frame: 5 + rng.int(3), scale: rng.range(0.85, 1.3), flipX: rng.next() < 0.5 });
    }
  }

  // 키가 큰 장식은 진입 경계 바깥의 절벽과 숲 가장자리에만 배치한다.
  for (const [along, across, vertical] of [[width, -48, false], [width, height + 48, false],
    [height, -48, true], [height, width + 48, true]] as const) {
    const slots = vertical ? 4 : 6;
    for (let i = 0; i < slots; i++) {
      if (rng.next() < 0.22) continue;
      const offset = Math.round((i + rng.range(0.25, 0.75)) * along / slots);
      decorations.push({ x: vertical ? across : offset, y: vertical ? offset : across,
        frame: 8 + rng.int(2), scale: rng.range(2.4, 3.4), flipX: rng.next() < 0.5 });
    }
  }
  return { theme, decorations };
}
